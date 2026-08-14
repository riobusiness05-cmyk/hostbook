import Anthropic from "@anthropic-ai/sdk";
import type { Restaurant } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MODEL } from "@/lib/claude";
import { minutesLabel } from "@/lib/host/format";
import { getAvailableSlots, toLocalDateStr } from "@/lib/availability";
import { createReservationForRestaurant } from "@/lib/reservationActions";
import { FloorState, getFloorState } from "./floor";
import { recommendSeating } from "./seating";
import {
  mergeTables,
  moveParty,
  seatParty,
  updateReservationStatus,
  HostFlowError,
} from "./actions";

// ── The AI Host Assistant ───────────────────────────────────────────────────
//
// Grounding guarantee: every answer is derived from a single live snapshot of
// the floor (`getFloorState`). The deterministic engine below matches the host
// question set directly against that snapshot, so it *cannot* invent tables,
// guests or numbers. When an ANTHROPIC_API_KEY is configured, free-form
// questions that the deterministic engine doesn't recognise are forwarded to
// Claude with the snapshot as the ONLY permitted source of truth and an
// explicit instruction to refuse anything not present in it.

export type AssistantResult = {
  reply: string;
  source: "engine" | "claude" | "unavailable";
  action?: string;
  data?: unknown;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function extractPartySize(msg: string): number | null {
  const digit = msg.match(/\b(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(msg)) return n;
  }
  return null;
}

function extractTops(msg: string): number | null {
  // "four tops", "4-tops", "two top"
  const m = msg.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*tops?\b/);
  if (!m) return null;
  const raw = m[1];
  return /\d/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] ?? null;
}

// The floor snapshot's `reservations` list spans -3h to +30 days (so the
// Bookings tab can show future dates). Most host questions ("who's arriving
// next", "who hasn't arrived", "birthdays tonight") mean *today's* service,
// not a booking three weeks out — so those queries scope back down to today.
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function fmtList(items: string[], empty: string): string {
  if (items.length === 0) return empty;
  return items.map((i) => `• ${i}`).join("\n");
}

function tableLabel(n: number, name?: string) {
  return name ? `Table ${n} (${name})` : `Table ${n}`;
}

// ── Deterministic, grounded answer engine ───────────────────────────────────
async function answerFromEngine(
  message: string,
  state: FloorState,
  restaurantId: string
): Promise<AssistantResult | null> {
  const m = message.toLowerCase().trim();
  const { tables, metrics, walkins, reservations, rush, sections } = state;

  // ── Actions ───────────────────────────────────────────────────────────
  // "move <name> to table <n>"
  const moveMatch = m.match(/move\s+(.+?)\s+to\s+table\s+(\d{1,2})/);
  if (moveMatch) {
    const name = moveMatch[1].trim();
    const toNum = Number(moveMatch[2]);
    const from = tables.find((t) => t.session && t.session.guestName.toLowerCase().includes(name));
    const to = tables.find((t) => t.tableNumber === toNum);
    if (!from) return { reply: `I can't find a seated party matching "${name}".`, source: "engine" };
    if (!to) return { reply: `There's no Table ${toNum}.`, source: "engine" };
    try {
      await moveParty(restaurantId, from.id, to.id);
      return {
        reply: `Moved ${from.session!.guestName} from Table ${from.tableNumber} to Table ${to.tableNumber}. Table ${from.tableNumber} is now marked dirty.`,
        source: "engine",
        action: "move",
      };
    } catch (e) {
      return { reply: e instanceof HostFlowError ? e.message : "Couldn't move the party.", source: "engine" };
    }
  }

  // "cancel <name> reservation" / "cancel reservation for <name>"
  const cancelMatch = m.match(/cancel\s+(?:the\s+)?(?:reservation\s+for\s+)?(.+?)(?:'s)?\s*(?:reservation)?$/);
  if (m.startsWith("cancel") && cancelMatch) {
    const name = cancelMatch[1].replace(/reservation/g, "").trim();
    const res = await prisma.reservation.findFirst({
      where: {
        restaurantId,
        status: { in: ["PENDING", "CONFIRMED"] },
        customerName: { contains: name },
      },
      orderBy: { reservationTime: "asc" },
    });
    if (!res) return { reply: `I can't find an active reservation for "${name}".`, source: "engine" };
    await updateReservationStatus(restaurantId, res.id, "CANCELLED");
    return { reply: `Cancelled ${res.customerName}'s reservation (party of ${res.partySize}).`, source: "engine", action: "cancel" };
  }

  // "merge tables A and B"
  const mergeMatch = m.match(/merge\s+tables?\s+(\d{1,2})\s+(?:and|&|\+|with)\s+(\d{1,2})/);
  if (mergeMatch) {
    const a = tables.find((t) => t.tableNumber === Number(mergeMatch[1]));
    const b = tables.find((t) => t.tableNumber === Number(mergeMatch[2]));
    if (!a || !b) return { reply: "One of those table numbers doesn't exist.", source: "engine" };
    try {
      await mergeTables(restaurantId, a.id, b.id);
      return { reply: `Merged Table ${b.tableNumber} into Table ${a.tableNumber}. Combined seats now ${a.seatsMax + b.seatsMax}.`, source: "engine", action: "merge" };
    } catch (e) {
      return { reply: e instanceof HostFlowError ? e.message : "Couldn't merge those tables.", source: "engine" };
    }
  }

  // "seat the next walk-in"
  if (/seat\s+(the\s+)?next\s+walk[\s-]?in/.test(m) || /seat\s+(the\s+)?next\s+in\s+line/.test(m)) {
    const next = walkins[0];
    if (!next) return { reply: "The waitlist is empty — no walk-ins to seat.", source: "engine" };
    const rec = recommendSeating(state, next.partySize);
    if (!rec.best && !rec.combo) {
      return { reply: `No free table can seat ${next.name} (${next.partySize}) right now. ${rec.message}`, source: "engine" };
    }
    const walkinRow = await prisma.walkin.findUnique({ where: { id: next.id } });
    if (!walkinRow || walkinRow.status !== "WAITING")
      return { reply: "That walk-in is no longer waiting.", source: "engine" };

    let tableId: string;
    let tableLabelText: string;
    if (rec.best) {
      tableId = rec.best.tableId;
      tableLabelText = `Table ${rec.best.tableNumber}`;
    } else {
      // No single table fits — merge the suggested pair and seat there.
      const [primaryId, otherId] = rec.combo!.tableIds;
      await mergeTables(restaurantId, primaryId, otherId);
      tableId = primaryId;
      tableLabelText = `Table ${rec.combo!.tableNumbers.join(" + Table ")} (combined)`;
    }

    await seatParty(restaurantId, {
      tableId,
      guestName: next.name,
      partySize: next.partySize,
      source: "WALKIN",
      walkinId: next.id,
      isVip: next.priority === "VIP",
    });
    return { reply: `Seated ${next.name} (${next.partySize}) at ${tableLabelText}.`, source: "engine", action: "seat" };
  }

  // ── Questions ───────────────────────────────────────────────────────────
  // "can we fit a walk-in of N" / "can we fit N"
  if (/\bfit\b|\baccommodate\b/.test(m)) {
    const size = extractPartySize(m);
    if (size) {
      const rec = recommendSeating(state, size);
      return { reply: rec.message, source: "engine", data: rec };
    }
  }

  // "show available four tops" / "available N tops"
  const tops = extractTops(m);
  if (tops && /(available|free|open|show)/.test(m)) {
    const matches = tables.filter((t) => t.status === "AVAILABLE" && t.seatsMax >= tops);
    return {
      reply: `Available tables seating ${tops}+:\n` +
        fmtList(matches.map((t) => `${tableLabel(t.tableNumber, t.name)} — seats ${t.seatsMax}, ${t.section?.name ?? "—"}`), "None free right now."),
      source: "engine",
    };
  }

  // free / available tables
  if (/(what|which|show|list).*(free|available|open).*table/.test(m) || /tables?.*(free|available|open)/.test(m)) {
    const free = tables.filter((t) => t.status === "AVAILABLE");
    return {
      reply: `${free.length} table${free.length === 1 ? "" : "s"} available:\n` +
        fmtList(free.map((t) => `${tableLabel(t.tableNumber, t.name)} — seats ${t.seatsMax}, ${t.section?.name ?? "—"}`), "Nothing free right now."),
      source: "engine",
    };
  }

  // late reservations
  if (/late/.test(m) && /reservation|booking|guest/.test(m)) {
    const late = reservations.filter((r) => r.isLate);
    return {
      reply: fmtList(
        late.map((r) => `${r.customerName} (${r.partySize}) — ${minutesLabel(Math.abs(r.minutesUntil))} late`),
        "No late reservations right now."
      ),
      source: "engine",
    };
  }

  // tables finishing next
  if (/(finish|free up|turn|done|leaving|available next)/.test(m)) {
    const soon = tables
      .filter((t) => t.session)
      .sort((a, b) => a.session!.minutesRemaining - b.session!.minutesRemaining)
      .slice(0, 5);
    return {
      reply: "Next tables to free up:\n" +
        fmtList(
          soon.map((t) => {
            const r = t.session!.minutesRemaining;
            return `${tableLabel(t.tableNumber)} — ${t.session!.guestName}, ${r <= 0 ? "over time" : `~${r} min`}`;
          }),
          "No tables currently occupied."
        ),
      source: "engine",
    };
  }

  // who is arriving next
  if (/(arriv|coming|next).*(guest|reservation|booking|next)/.test(m) || /who.*(next|arriv)/.test(m)) {
    const upcoming = reservations.filter((r) => r.minutesUntil >= 0 && isToday(r.reservationTime)).slice(0, 5);
    return {
      reply: "Upcoming arrivals:\n" +
        fmtList(
          upcoming.map((r) => `${r.customerName} (${r.partySize})${r.isVip ? " ⭐VIP" : ""} — in ${minutesLabel(r.minutesUntil)}${r.tableId ? ` → Table ${tables.find((t) => t.id === r.tableId)?.tableNumber ?? "?"}` : ""}`),
          "No upcoming arrivals booked."
        ),
      source: "engine",
    };
  }

  // tables needing cleaning
  if (/(clean|dirty|buss|reset)/.test(m)) {
    const dirty = tables.filter((t) => t.status === "DIRTY" || t.status === "CLEANING");
    return {
      reply: fmtList(
        dirty.map((t) => `${tableLabel(t.tableNumber, t.name)} — ${t.status === "DIRTY" ? "needs bussing" : "being cleaned"}`),
        "All tables are clean."
      ),
      source: "engine",
    };
  }

  // covers tonight
  if (/(how many )?covers/.test(m)) {
    return { reply: `${metrics.covers} covers seated right now across ${metrics.counts.OCCUPIED} occupied tables. ${metrics.upcomingArrivals} more parties arriving within the hour.`, source: "engine" };
  }

  // occupancy
  if (/occupanc|how full|capacity/.test(m)) {
    return { reply: `Occupancy is ${metrics.occupancyPct}% — ${metrics.seatsAvailable} seats available across ${metrics.counts.AVAILABLE} open tables.`, source: "engine" };
  }

  // rush
  if (/rush|peak|busy.*when|when.*busy/.test(m)) {
    return {
      reply: metrics.counts.AVAILABLE === 0 || rush.peakOccupancyPct >= 95
        ? `Peak is around ${rush.peakLabel} at ~${rush.peakOccupancyPct}% occupancy${rush.minutesToPeak > 0 ? `, about ${rush.minutesToPeak} min out` : " — happening now"}. Expect ~${rush.predictedWaitMinutes} min waits.`
        : `Busiest point is projected around ${rush.peakLabel} at ~${rush.peakOccupancyPct}% (${rush.minutesToPeak} min out).`,
      source: "engine",
    };
  }

  // reservations that haven't arrived
  if (/(haven'?t|not) (arrived|shown|here)/.test(m) || /outstanding reservation/.test(m)) {
    const pending = reservations.filter((r) => r.status !== "ARRIVED" && r.status !== "SEATED" && isToday(r.reservationTime));
    return {
      reply: fmtList(
        pending.map((r) => `${r.customerName} (${r.partySize}) — ${r.minutesUntil < 0 ? `${minutesLabel(Math.abs(r.minutesUntil))} late` : `in ${minutesLabel(r.minutesUntil)}`}`),
        "Everyone booked so far has arrived."
      ),
      source: "engine",
    };
  }

  // birthdays / anniversaries / occasions
  if (/birthday|anniversar|occasion|celebrat/.test(m)) {
    const occ = [
      ...tables.filter((t) => t.session?.occasion).map((t) => `${t.session!.guestName} — ${t.session!.occasion} (seated, Table ${t.tableNumber})`),
      ...reservations.filter((r) => r.occasion && isToday(r.reservationTime)).map((r) => `${r.customerName} — ${r.occasion} (arriving in ${minutesLabel(r.minutesUntil)})`),
    ];
    return { reply: fmtList(occ, "No special occasions flagged tonight."), source: "engine" };
  }

  // waited longest
  if (/waited (the )?longest|longest wait/.test(m)) {
    if (walkins.length === 0) return { reply: "No one is on the waitlist right now.", source: "engine" };
    const longest = walkins.reduce((a, b) => (b.minutesWaiting > a.minutesWaiting ? b : a));
    return { reply: `${longest.name} (${longest.partySize}) has waited longest — ${longest.minutesWaiting} min (quoted ${longest.quotedWaitMinutes} min).`, source: "engine" };
  }

  // waiting to move outside
  if (/(wait|waiting|move|moving|hold).*(outside|outdoor|terrace|garden)/.test(m) || /(outside|outdoor).*(wait|table|move)/.test(m)) {
    const list = state.waitingToMoveOutside;
    const freeOutdoor = tables.filter(
      (t) => t.status === "AVAILABLE" && sections.find((s) => s.id === t.section?.id)?.isOutdoor
    );
    const header =
      freeOutdoor.length > 0
        ? `${freeOutdoor.length} outdoor table(s) free now (${freeOutdoor.map((t) => `T${t.tableNumber}`).join(", ")}).\n`
        : "No outdoor tables are free right now.\n";
    return {
      reply:
        header +
        fmtList(
          list.map((w) => `${w.guestName} (${w.partySize}) at Table ${w.tableNumber} — ${minutesLabel(w.minutesSeated)} at the bar`),
          "No one is waiting to move outside."
        ),
      source: "engine",
    };
  }

  // busiest section
  if (/section.*(busiest|busy)|busiest section|which section/.test(m)) {
    if (sections.length === 0) return { reply: "No sections configured.", source: "engine" };
    const busiest = sections.reduce((a, b) => (b.occupiedCount > a.occupiedCount ? b : a));
    return { reply: `${busiest.name} is busiest — ${busiest.occupiedCount} of ${busiest.tableCount} tables occupied.`, source: "engine" };
  }

  // exceeded dining time / overrun
  if (/(exceed|over|past).*(dining|time|average)/.test(m) || /overrun/.test(m)) {
    const over = tables.filter((t) => t.session?.isOverrun);
    return {
      reply: fmtList(
        over.map((t) => `${tableLabel(t.tableNumber)} — ${t.session!.guestName}, ${minutesLabel(t.session!.minutesSeated)} seated (${minutesLabel(Math.abs(t.session!.minutesRemaining))} over)`),
        "No tables have exceeded their dining time."
      ),
      source: "engine",
    };
  }

  // walk-ins waiting
  if (/walk[\s-]?in/.test(m) && /wait|how many|queue|list/.test(m)) {
    return {
      reply: `${walkins.length} walk-in${walkins.length === 1 ? "" : "s"} waiting (${metrics.walkinCoversWaiting} covers):\n` +
        fmtList(walkins.map((w) => `${w.name} (${w.partySize})${w.priority !== "NORMAL" ? ` [${w.priority}]` : ""} — waiting ${w.minutesWaiting} min`), ""),
      source: "engine",
    };
  }

  // service health
  if (/health|how'?s service|how is service/.test(m)) {
    return { reply: `Service health score is ${metrics.serviceHealthScore}/100. Occupancy ${metrics.occupancyPct}%, ${metrics.lateReservations} late, ${metrics.walkinsWaiting} waiting, kitchen load ${metrics.kitchenLoad}%.`, source: "engine" };
  }

  return null;
}

// ── Compact grounded snapshot for the LLM fallback ──────────────────────────
function snapshotForLLM(state: FloorState): string {
  const t = state.tables.map((x) => ({
    n: x.tableNumber,
    status: x.status,
    seats: x.seatsMax,
    section: x.section?.name,
    guest: x.session?.guestName,
    party: x.session?.partySize,
    minsSeated: x.session?.minutesSeated,
    minsLeft: x.session?.minutesRemaining,
    waitingForOutdoor: x.session?.waitingForOutdoor,
    reservation: x.reservation?.customerName,
  }));
  return JSON.stringify(
    {
      metrics: state.metrics,
      rush: { peak: state.rush.peakLabel, peakPct: state.rush.peakOccupancyPct, waitMins: state.rush.predictedWaitMinutes },
      tables: t,
      walkins: state.walkins.map((w) => ({ name: w.name, party: w.partySize, priority: w.priority, waited: w.minutesWaiting })),
      reservations: state.reservations.map((r) => ({ name: r.customerName, party: r.partySize, inMins: r.minutesUntil, late: r.isLate, vip: r.isVip, occasion: r.occasion })),
      sections: state.sections,
    },
    null,
    0
  );
}

// ── Booking creation via Claude tool-use ────────────────────────────────────
// The deterministic engine above is regex-based and deliberately can't parse
// free-form dates ("next Friday", "tomorrow at 8"), so booking creation is
// handled by Claude with two tools: check_availability (read-only) and
// create_booking (writes through the same createReservationForRestaurant
// used by the public booking widget, so availability rules never diverge).
type ToolDefinition = { name: string; description: string; input_schema: Record<string, unknown> };
type ContentBlock = Record<string, any>;

const bookingTools: ToolDefinition[] = [
  {
    name: "check_availability",
    description: "Check which time slots are open for a given date and party size. Call this if the host asks what's available, or to suggest alternatives when a requested time is full.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        partySize: { type: "integer" },
      },
      required: ["date", "partySize"],
    },
  },
  {
    name: "create_booking",
    description: "Create a confirmed reservation on the floor. Only call this once you have the guest's name, date, time, and party size — ask the host for anything missing rather than guessing.",
    input_schema: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM 24-hour" },
        partySize: { type: "integer" },
        customerPhone: { type: "string" },
        customerEmail: { type: "string" },
        notes: { type: "string", description: "Occasion, seating preference, allergies, etc." },
      },
      required: ["customerName", "date", "time", "partySize"],
    },
  },
];

async function executeBookingTool(restaurant: Restaurant, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "check_availability": {
      const slots = await getAvailableSlots({ restaurant, dateStr: String(input.date), partySize: Number(input.partySize) });
      return slots.length ? { available: true, slots } : { available: false, message: "No open tables for that date/party size." };
    }
    case "create_booking": {
      const result = await createReservationForRestaurant(restaurant, {
        date: String(input.date),
        time: String(input.time),
        partySize: Number(input.partySize),
        customerName: String(input.customerName),
        customerEmail: (input.customerEmail as string) || "",
        customerPhone: (input.customerPhone as string) || "",
        notes: (input.notes as string) || "",
        source: "ADMIN",
      });
      return result.ok ? { success: true, ...result.data } : { success: false, error: result.error };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function answerWithClaude(
  message: string,
  state: FloorState,
  restaurant: Restaurant,
  history: { role: "user" | "assistant"; text: string }[]
): Promise<AssistantResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = MODEL;
  const today = toLocalDateStr(new Date(), restaurant.timezone);
  const system =
    "You are the AI Host Assistant for a busy restaurant floor. For questions about the live floor, answer ONLY using the JSON DATA block below — " +
    "never invent tables, guests, times, or numbers, and say so if the answer isn't derivable from it. " +
    "You can also take new bookings using the check_availability and create_booking tools: work out the exact date/time from what the host says " +
    `(today is ${today}, restaurant timezone ${restaurant.timezone}), and ask for anything missing (name, date, time, or party size) instead of guessing. ` +
    "Be concise and scannable — short lines, table numbers, minutes.\n\n" +
    `DATA:\n${snapshotForLLM(state)}`;

  // The Anthropic API requires the first message to have role "user" — the
  // client's history can start with the assistant's opening greeting, so
  // drop any leading assistant turns before splicing it in.
  const firstUserIdx = history.findIndex((h) => h.role === "user");
  const trimmedHistory = firstUserIdx === -1 ? [] : history.slice(firstUserIdx);
  const messages: { role: "user" | "assistant"; content: string | ContentBlock[] }[] = [
    ...trimmedHistory.map((h) => ({ role: h.role, content: h.text })),
    { role: "user" as const, content: message },
  ];

  let action: string | undefined;
  for (let iteration = 0; iteration < 4; iteration++) {
    const resp = await client.messages.create({
      model,
      max_tokens: 500,
      system,
      messages: messages as any,
      tools: bookingTools as any,
    });

    if (resp.stop_reason !== "tool_use") {
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text || "I don't have that information on the floor right now.", source: "claude", action };
    }

    messages.push({ role: "assistant", content: resp.content as unknown as ContentBlock[] });
    const toolResults: ContentBlock[] = [];
    for (const block of resp.content as unknown as ContentBlock[]) {
      if (block.type !== "tool_use") continue;
      const result = await executeBookingTool(restaurant, block.name, block.input as Record<string, unknown>);
      if (block.name === "create_booking" && (result as { success?: boolean }).success) action = "book";
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: "I'm having trouble finishing that — could you rephrase, or book it manually via + New reservation?", source: "claude", action };
}

export async function runAssistant(
  restaurantId: string,
  message: string,
  history: { role: "user" | "assistant"; text: string }[] = []
): Promise<AssistantResult> {
  const state = await getFloorState(restaurantId);
  const engineAnswer = await answerFromEngine(message, state, restaurantId);
  if (engineAnswer) return engineAnswer;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      return await answerWithClaude(message, state, restaurant, history);
    } catch (e) {
      console.error("[hostflow] assistant Claude error", e);
      // A configured key that still fails (exhausted credit, outage, rate
      // limit) is a real fault, not "the host asked something odd" — say so
      // rather than quietly reusing the not-configured fallback below, which
      // reads as "I didn't understand you" and hides that anything is wrong.
      return {
        reply:
          "The AI assistant is temporarily unavailable, so I can only handle simple floor questions right now — try:\n" +
          "• What tables are free?\n• Who's arriving next?\n• Can we fit a walk-in of 6?\n" +
          "• Move Rossi to Table 14.\n• Cancel Blackwood's reservation.\n\n" +
          "For anything else, use + New reservation or the floor plan directly.",
        source: "unavailable",
      };
    }
  }

  // No ANTHROPIC_API_KEY configured at all — expected/intentional, not a
  // fault, so this reads as "here's what I can do" rather than an error.
  return {
    reply:
      "I can answer from live floor data — try:\n" +
      "• What tables are free?\n• Who's arriving next?\n• Can we fit a walk-in of 6?\n" +
      "• What tables have exceeded dining time?\n• When's the rush?\n• Seat the next walk-in.\n" +
      "• Move Rossi to Table 14.\n• Cancel Blackwood's reservation.\n" +
      "• Book a table for John Smith, 4 people, tomorrow at 8pm.",
    source: "engine",
  };
}
