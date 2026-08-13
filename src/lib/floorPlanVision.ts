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

const SYSTEM_PROMPT = `You are a precise floor-plan digitizer for a restaurant table-management app.
You will be shown a photo or screenshot of a restaurant's real floor plan (it may be hand-drawn, a POS
system's table map, or an architectural sketch). Identify every individual table you can see.

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

Rules:
- "x" and "y" are normalized 0..1 coordinates of the table's center within the image (0,0 = top-left).
- "number" is the table's printed/labeled number if visible, otherwise null — never invent one.
- "seats" is the chair count actually drawn/visible around that table, not a guess from table size alone.
- If two or more tables are drawn pushed together / joined as one combined surface, set "mergedWithTempId"
  on every table except the largest/primary one in that group to that primary table's tempId.
- Group tables into sections by visibly distinct areas (indoor rooms, terraces, bar, patio). If the image
  shows only one area, return a single section. Mark "isOutdoor" true only for terraces/patios/gardens —
  never guess when it isn't visually clear either way (default false).
- "confidence" per table: 1.0 = clearly labeled and unambiguous, 0.5 or below = you are guessing at the
  number, seat count, or position. Be honest and conservative — the app will ask a human to confirm any
  table below 0.6 rather than silently trusting a guess.
- "notes": plain-English flags for anything you weren't sure about (illegible numbers, ambiguous shapes,
  tables that might be merged but you're not certain, areas that might be indoor or outdoor).
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
      max_tokens: 4096,
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

  let parsed: unknown;
  try {
    // Models sometimes wrap JSON in a fenced code block despite instructions — strip it defensively.
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    throw new HostFlowError("The AI's response wasn't valid JSON. Try again, or a different photo.", 422);
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

  const tables: DetectedTable[] = rawTables.map((t: Record<string, unknown>, i: number) => ({
    tempId: typeof t.tempId === "string" ? t.tempId : `table-${i}`,
    number: typeof t.number === "number" ? t.number : null,
    shape: t.shape === "ROUND" || t.shape === "RECT" ? t.shape : "SQUARE",
    seats: typeof t.seats === "number" && t.seats > 0 ? Math.round(t.seats) : 2,
    x: clamp01(typeof t.x === "number" ? t.x : 0.5),
    y: clamp01(typeof t.y === "number" ? t.y : 0.5),
    rotation: typeof t.rotation === "number" ? ((Math.round(t.rotation) % 360) + 360) % 360 : 0,
    mergedWithTempId: typeof t.mergedWithTempId === "string" ? t.mergedWithTempId : null,
    sectionTempId: typeof t.sectionTempId === "string" ? t.sectionTempId : sections[0].tempId,
    confidence: clamp01(typeof t.confidence === "number" ? t.confidence : 0.5),
  }));

  const notes = Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === "string") : [];
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
