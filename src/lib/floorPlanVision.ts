import { getClient, MODEL } from "@/lib/claude";
import { HostFlowError } from "@/lib/hostflow/actions";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * AI floor-plan-from-image: sends an uploaded photo of a restaurant's real
 * floor plan (or POS table-map screenshot) to Claude's vision API and asks
 * for a structured description of every table it can see. Nothing here
 * writes to the database — see the "apply" route for that — this is purely
 * detection, so a host always reviews/edits before anything is created.
 */

export type DetectedTable = {
  tempId: string;
  number: number | null;
  shape: "ROUND" | "SQUARE" | "RECT";
  seats: number;
  x: number; // 0..1, normalized left-to-right across the image
  y: number; // 0..1, normalized top-to-bottom across the image
  rotation: number; // degrees, 0 = upright
  mergedWithTempId: string | null; // another table's tempId if drawn as one combined table
  sectionTempId: string;
  confidence: number; // 0..1 — the model's own confidence in this one table
};

export type DetectedSection = {
  tempId: string;
  name: string;
  isOutdoor: boolean;
};

export type FloorPlanAnalysis = {
  sections: DetectedSection[];
  tables: DetectedTable[];
  overallConfidence: number;
  lowConfidenceCount: number;
  notes: string[]; // things the model wasn't sure about, in plain English
};

const SYSTEM_PROMPT = `You are a precise floor-plan digitizer for a restaurant and bar table-management app.
You will be shown a photo or screenshot of a real venue's floor plan (it may be hand-drawn, a POS
system's table map, or an architectural sketch, and the venue may be a restaurant, a bar, or a lounge).
Identify every individual bookable seating unit you can see — this includes ordinary dining tables AND
bar-specific furniture:
- A bar counter or rail (guests seated in a row along a straight or L/U-shaped counter) is ONE table:
  use shape "RECT", "seats" = the number of stools/seats actually visible along it (count them; a long
  counter routinely seats 10-20+), and set "rotation" so the long axis of the resulting rectangle matches
  the counter's real orientation in the photo (0 or 180 for a counter running left-right, 90 or 270 for
  one running top-to-bottom). Never split one continuous counter into several small tables just because
  it's long — length is expected, not a reason to break it up.
- High-top / cocktail tables (small standing-height round or square tables, often with 2-4 stools) are
  ordinary tables — "ROUND" or "SQUARE" depending on their visible shape.
- Booths and banquette seating are "RECT".
- If a counter has a visibly distinct curved or L-shaped corner section, you may still represent the
  whole thing as one RECT positioned/rotated at its dominant straight run — precision on the corner
  geometry matters far less than getting the seat count and rough position right.

Respond with ONLY a single JSON object (no markdown fences, no prose before or after) matching exactly:
{
  "sections": [{ "tempId": string, "name": string, "isOutdoor": boolean }],
  "tables": [{
    "tempId": string,
    "number": number | null,
    "shape": "ROUND" | "SQUARE" | "RECT",
    "seats": number,
    "x": number,
    "y": number,
    "rotation": number,
    "mergedWithTempId": string | null,
    "sectionTempId": string,
    "confidence": number
  }],
  "overallConfidence": number,
  "notes": [string]
}

Before listing a single table, do this as its own step: scan the whole image for distinct
areas/rooms and decide the "sections" list first. A real venue's floor plan is very rarely one
undivided space — treat "everything in one section" as your least likely answer, not your default,
and actively look for evidence of separate areas rather than waiting for it to be obvious:
- Printed text labels are the strongest signal — room/area names ("PATIO", "BAR", "MAIN DINING",
  "LOUNGE", "TERRACE", section letters/numbers, etc.) are extremely common on real floor plans and
  POS table maps. If you see ANY such label anywhere in the image, every one of them is its own
  section — do not merge two differently-labeled areas into one just because they're both indoors.
- Structural/visual boundaries also count even without a text label: walls, partitions, a change in
  flooring/shading, a clear physical gap between two clusters of tables, or a bar counter (the area
  around a bar counter is its own section, not part of the dining room).
- A floor plan with many tables (a large or multi-room venue) is a signal to look *harder* for
  sections, not a reason to give up and lump everything under one generic name — dumping 30+ tables
  into a single "Main Dining Room" because splitting them felt tedious is exactly the failure mode to
  avoid. If you truly cannot find any dividing evidence anywhere in the image, one section is fine —
  but that should be a deliberate conclusion after looking, not a default.
- Every single table's "sectionTempId" MUST reference one of the tempIds in your own "sections" list —
  never leave it blank/undefined and never invent a tempId that isn't in "sections". A table you're
  unsure about still needs your best-guess section, not a missing one.

Other rules:
- "x" and "y" are normalized 0..1 coordinates of the table's center within the image (0,0 = top-left).
- "number" is the table's printed/labeled number if visible, otherwise null — never invent one.
- "seats" is the chair count actually drawn/visible around that table, not a guess from table size alone.
- If two or more tables are drawn pushed together / joined as one combined surface, set "mergedWithTempId"
  on every table except the largest/primary one in that group to that primary table's tempId.
- Mark "isOutdoor" true only for terraces/patios/gardens — never guess when it isn't visually clear
  either way (default false).
- "confidence" per table: 1.0 = clearly labeled and unambiguous, 0.5 or below = you are guessing at the
  number, seat count, or position. Be honest and conservative — the app will ask a human to confirm any
  table below 0.6 rather than silently trusting a guess.
- "notes": plain-English flags for anything you weren't sure about (illegible numbers, ambiguous shapes,
  tables that might be merged but you're not certain, areas that might be indoor or outdoor, or areas you
  suspect are distinct but couldn't find a label for).
- Never fabricate tables that aren't visibly present in the image.`;

export async function analyzeFloorPlanImage(base64Data: string, mediaType: string): Promise<FloorPlanAnalysis> {
  let client;
  try {
    client = getClient();
  } catch {
    throw new HostFlowError("AI floor-plan detection isn't configured yet (no ANTHROPIC_API_KEY).", 503);
  }

  const allowedMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const safeMediaType = (allowedMediaTypes as readonly string[]).includes(mediaType)
    ? (mediaType as (typeof allowedMediaTypes)[number])
    : "image/jpeg";

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      // A busy restaurant or bar floor plan can easily run 30-50+ detected
      // tables; each one's JSON is a few hundred characters, so the old
      // 4096-token cap could truncate mid-object on a genuinely large venue
      // — the exact failure mode that surfaces to a host as "response
      // wasn't valid JSON" with no way to tell what actually went wrong.
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: safeMediaType, data: base64Data } },
            { type: "text", text: "Digitize this floor plan into the JSON schema described in your instructions." },
          ],
        },
      ],
      // NOTE: tried prefilling the assistant turn with "{" to force a
      // JSON-only response (the usual fix for a model adding prose before
      // JSON) — claude-sonnet-5 rejects that outright ("This model does not
      // support assistant message prefill"), confirmed live. Extraction
      // below has to tolerate stray prose instead.
    });
  } catch (err) {
    // The raw SDK error embeds Anthropic's own API/vendor error body (e.g.
    // "credit balance too low") — useful in server logs, not something to
    // show a host, who'd just see a confusing, unactionable wall of JSON.
    console.error("[floor-plan-vision] AI request failed", err);
    throw new HostFlowError(
      "AI floor-plan detection is temporarily unavailable — try again shortly, or build your floor plan from a template or by adding tables manually.",
      502
    );
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new HostFlowError("The AI didn't return a readable response. Try a clearer photo.", 422);

  const rawText = textBlock.text;

  let parsed: unknown;
  try {
    // No prefill available on this model (see the note above the API call),
    // so the response can genuinely start/end with prose despite the system
    // prompt saying not to — strip a markdown fence if present, then fall
    // back to slicing out the outermost {...} span rather than assuming the
    // whole trimmed string is the JSON object.
    let cleaned = rawText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last < first) {
      throw new Error("no JSON object found in response");
    }
    cleaned = cleaned.slice(first, last + 1);
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Without this, a bad response leaves zero trace of what the AI
    // actually sent — every past occurrence of this error was undiagnosable
    // for exactly that reason. Truncated to a sane length for the logs.
    console.error(
      "[floor-plan-vision] response wasn't valid JSON",
      { stopReason: response.stop_reason, length: rawText.length, preview: rawText.slice(0, 2000) },
      err
    );
    const truncated = response.stop_reason === "max_tokens";
    throw new HostFlowError(
      truncated
        ? "That floor plan was too large for the AI to digitize in one pass — try a photo of one room/section at a time."
        : "The AI's response wasn't valid JSON. Try again, or a different photo.",
      422
    );
  }

  return normalizeAnalysis(parsed);
}

function normalizeAnalysis(raw: unknown): FloorPlanAnalysis {
  const r = raw as Record<string, unknown>;
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  const rawTables = Array.isArray(r.tables) ? r.tables : [];

  const sections: DetectedSection[] = rawSections.map((s: Record<string, unknown>, i: number) => ({
    tempId: typeof s.tempId === "string" ? s.tempId : `section-${i}`,
    name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : `Area ${i + 1}`,
    isOutdoor: Boolean(s.isOutdoor),
  }));
  if (sections.length === 0) sections.push({ tempId: "section-0", name: "Main Room", isOutdoor: false });

  // Guards against a table's sectionTempId referencing a section that isn't
  // actually in the response (typo, stale id, off-by-one) — previously this
  // string was accepted as-is if it merely existed, so a mismatched id could
  // silently vanish from every section's grouping in the review screen
  // without ever falling back or being flagged. Every mismatch now falls
  // back visibly (via the note below) instead of silently.
  const sectionTempIds = new Set(sections.map((s) => s.tempId));
  let unmatchedSectionCount = 0;

  const tables: DetectedTable[] = rawTables.map((t: Record<string, unknown>, i: number) => {
    const claimedSectionTempId = typeof t.sectionTempId === "string" ? t.sectionTempId : "";
    const sectionTempId = sectionTempIds.has(claimedSectionTempId) ? claimedSectionTempId : sections[0].tempId;
    if (sectionTempId !== claimedSectionTempId) unmatchedSectionCount++;
    return {
      tempId: typeof t.tempId === "string" ? t.tempId : `table-${i}`,
      number: typeof t.number === "number" ? t.number : null,
      shape: t.shape === "ROUND" || t.shape === "RECT" ? t.shape : "SQUARE",
      // Clamped to the apply route's own max (see tableSchema in
      // floor-plan/apply/route.ts) so a wildly overcounted bar counter can't
      // reach the review screen showing a number that fails to apply later.
      seats: typeof t.seats === "number" && t.seats > 0 ? Math.min(40, Math.round(t.seats)) : 2,
      x: clamp01(typeof t.x === "number" ? t.x : 0.5),
      y: clamp01(typeof t.y === "number" ? t.y : 0.5),
      rotation: typeof t.rotation === "number" ? ((Math.round(t.rotation) % 360) + 360) % 360 : 0,
      mergedWithTempId: typeof t.mergedWithTempId === "string" ? t.mergedWithTempId : null,
      sectionTempId,
      confidence: clamp01(typeof t.confidence === "number" ? t.confidence : 0.5),
    };
  });

  const notes = Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === "string") : [];
  if (unmatchedSectionCount > 0) {
    notes.push(
      `${unmatchedSectionCount} table(s) couldn't be matched to a specific area and were grouped into "${sections[0].name}" — you may want to move them after applying.`
    );
  }
  // A large batch collapsed into one section is very likely the "gave up
  // splitting" failure mode the system prompt now explicitly warns
  // against — surfacing it here means it shows up in the review screen
  // instead of only being visible by inspecting the database afterward.
  if (sections.length === 1 && tables.length >= 15) {
    notes.push(
      `All ${tables.length} tables were grouped into one area ("${sections[0].name}") — if this venue actually has more than one room/section, try re-uploading a clearer photo or a photo of one area at a time.`
    );
  }
  const overallConfidence =
    typeof r.overallConfidence === "number"
      ? clamp01(r.overallConfidence)
      : tables.length
      ? tables.reduce((n, t) => n + t.confidence, 0) / tables.length
      : 0;

  return {
    sections,
    tables,
    overallConfidence,
    lowConfidenceCount: tables.filter((t) => t.confidence < 0.6).length,
    notes,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
