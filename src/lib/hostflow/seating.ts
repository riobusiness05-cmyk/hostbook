import { FloorState, TableDTO } from "./floor";
import { SettingsDTO } from "./floor";

export type SeatingCandidate = {
  tableId: string;
  tableNumber: number;
  name: string;
  seatsMax: number;
  sectionName: string | null;
  serverName: string | null;
  score: number;
  waste: number; // empty seats if this party takes the table
  reasons: string[];
};

export type SeatingRecommendation = {
  partySize: number;
  immediate: SeatingCandidate[]; // can seat right now, best first
  best: SeatingCandidate | null;
  estimatedWaitMinutes: number; // 0 if a table is free now
  nextFreeTableNumber: number | null;
  message: string;
};

/**
 * Smart seating engine. Given the live floor and a party size, rank the
 * tables that could seat the party *right now*, and if none can, estimate
 * how long until one frees.
 *
 * Optimisation goals (from the brief), encoded as an additive score:
 *  • Don't waste large tables on small parties — heavily penalise empty seats.
 *  • Prefer an exact / tight fit.
 *  • Balance server workload — favour the least-loaded server's section.
 *  • Preserve flexibility — keep the largest tables free for large parties.
 */
export function recommendSeating(
  state: FloorState,
  partySize: number,
  opts: { sectionId?: string; preferSmall?: boolean } = {}
): SeatingRecommendation {
  const settings = state.settings;

  // Covers currently carried by each server → workload balancing.
  const loadByServer = new Map<string, number>();
  for (const t of state.tables) {
    if (t.server && t.session) {
      loadByServer.set(t.server.id, (loadByServer.get(t.server.id) ?? 0) + t.session.partySize);
    }
  }
  const maxLoad = Math.max(1, ...Array.from(loadByServer.values()));

  const fits = (t: TableDTO) => t.seatsMax >= partySize;

  const candidates: SeatingCandidate[] = state.tables
    .filter((t) => t.status === "AVAILABLE" && fits(t))
    .filter((t) => (opts.sectionId ? t.section?.id === opts.sectionId : true))
    .map((t) => {
      const waste = t.seatsMax - partySize;
      const reasons: string[] = [];
      let score = 100;

      // Wasted seats hurt most — 9 pts per empty seat.
      score -= waste * 9;
      if (waste === 0) reasons.push("Exact fit");
      else if (waste <= 1) reasons.push("Tight fit");
      else if (waste >= 4) reasons.push(`Wastes ${waste} seats`);

      // Preserve big tables: extra penalty for seating a small party at a
      // table that could hold a much larger one.
      if (t.seatsMax >= 8 && partySize <= 4) {
        score -= 15;
        reasons.push("Holds back a large table");
      }

      // Server workload balancing — reward the least-loaded server.
      const load = t.server ? loadByServer.get(t.server.id) ?? 0 : 0;
      const balance = Math.round(((maxLoad - load) / maxLoad) * 12);
      score += balance;
      if (t.server && load === 0) reasons.push(`${t.server.name} is open`);

      return {
        tableId: t.id,
        tableNumber: t.tableNumber,
        name: t.name,
        seatsMax: t.seatsMax,
        sectionName: t.section?.name ?? null,
        serverName: t.server?.name ?? null,
        score,
        waste,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    const best = candidates[0];
    return {
      partySize,
      immediate: candidates,
      best,
      estimatedWaitMinutes: 0,
      nextFreeTableNumber: best.tableNumber,
      message: `Seat at Table ${best.tableNumber} (${best.name}) — ${best.reasons[0] ?? "good fit"}.`,
    };
  }

  // Nothing free now → estimate the wait from the soonest fitting table.
  const wait = estimateWait(state, partySize, settings);
  return {
    partySize,
    immediate: [],
    best: null,
    estimatedWaitMinutes: wait.minutes,
    nextFreeTableNumber: wait.tableNumber,
    message:
      wait.tableNumber != null
        ? `No table free now. Table ${wait.tableNumber} should open in ~${wait.minutes} min (incl. cleaning).`
        : `No table can seat a party of ${partySize} right now.`,
  };
}

function estimateWait(
  state: FloorState,
  partySize: number,
  settings: SettingsDTO
): { minutes: number; tableNumber: number | null } {
  const fitting = state.tables.filter((t) => t.seatsMax >= partySize && t.session);
  if (fitting.length === 0) return { minutes: 0, tableNumber: null };
  const soonest = fitting.reduce((best, t) =>
    (t.session!.minutesRemaining < best.session!.minutesRemaining ? t : best)
  );
  const minutes = Math.max(0, soonest.session!.minutesRemaining) + settings.cleaningMinutes;
  return { minutes, tableNumber: soonest.tableNumber };
}
