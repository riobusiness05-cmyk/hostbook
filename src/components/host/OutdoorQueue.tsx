"use client";

import { useState } from "react";
import type { FloorState } from "@/lib/hostflow/floor";
import { Card, Button, SectionTitle } from "./ui";
import { minutesLabel } from "@/lib/host/format";
import * as api from "@/lib/host/client";

// The "moving outside" queue: parties seated (usually at the bar) waiting for
// an outdoor table to eat. Shows who's next and lets the host move the party
// straight to the best free outdoor table in one tap.
export function OutdoorQueue({
  state,
  refresh,
  onSelectTable,
}: {
  state: FloorState;
  refresh: () => Promise<void>;
  onSelectTable: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outdoorSectionIds = new Set(state.sections.filter((s) => s.isOutdoor).map((s) => s.id));

  // Best free outdoor table for a given party size (smallest that fits).
  const bestOutdoorTable = (partySize: number) =>
    state.tables
      .filter((t) => t.status === "AVAILABLE" && t.section && outdoorSectionIds.has(t.section.id) && t.seatsMax >= partySize)
      .sort((a, b) => a.seatsMax - b.seatsMax)[0] ?? null;

  const moveOutside = async (fromTableId: string, partySize: number) => {
    const target = bestOutdoorTable(partySize);
    if (!target) return;
    setBusyId(fromTableId);
    setError(null);
    try {
      await api.tableAction(fromTableId, { action: "move", toTableId: target.id });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const freeOutdoor = state.tables.filter(
    (t) => t.status === "AVAILABLE" && t.section && outdoorSectionIds.has(t.section.id)
  ).length;

  return (
    <Card className="p-4">
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">🌿 Moving outside · {state.waitingToMoveOutside.length}</span>
      </SectionTitle>

      <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        {freeOutdoor > 0
          ? `${freeOutdoor} outdoor table${freeOutdoor === 1 ? "" : "s"} free now`
          : "No outdoor tables free — parties are holding at the bar"}
      </p>

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="space-y-2">
        {state.waitingToMoveOutside.map((w) => {
          const target = bestOutdoorTable(w.partySize);
          return (
            <div
              key={w.tableId}
              className="rounded-xl border border-teal-500/20 bg-teal-500/[0.06] p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => onSelectTable(w.tableId)}>
                  <span className="font-semibold text-neutral-900 dark:text-white">{w.guestName}</span>
                  <span className="ml-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                    T{w.tableNumber} · {w.partySize}p · {minutesLabel(w.minutesSeated)} at {w.sectionName ?? "bar"}
                  </span>
                </button>
              </div>
              <Button
                size="sm"
                variant={target ? "primary" : "secondary"}
                className="mt-2 w-full"
                disabled={!target || busyId === w.tableId}
                onClick={() => moveOutside(w.tableId, w.partySize)}
                title={target ? `Move to Table ${target.tableNumber}` : "No outdoor table free"}
              >
                {target ? `Move outside → Table ${target.tableNumber}` : "Waiting for outdoor table"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
