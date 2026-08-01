"use client";

import type { FloorState } from "@/lib/hostflow/floor";
import { Card, SectionTitle } from "./ui";
import { cx, minutesLabel, timeOfDay } from "@/lib/host/format";

// Every occupied table right now, in one glance-able list — driven by the
// same live floor state as everything else (SSE push + the periodic tick),
// so it updates automatically the instant a table is seated or released,
// with no polling of its own.
export function CurrentlySeatedPanel({ state, onSelectTable }: { state: FloorState; onSelectTable: (id: string) => void }) {
  const seated = state.tables
    .filter((t) => t.session)
    .sort((a, b) => a.session!.minutesRemaining - b.session!.minutesRemaining);

  return (
    <Card className="flex h-full flex-col p-4">
      <SectionTitle>Currently seated · {seated.length}</SectionTitle>

      <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
        {seated.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">No tables seated.</p>}
        {seated.map((t) => {
          const s = t.session!;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTable(t.id)}
              className={cx(
                "w-full rounded-xl border p-3 text-left transition-colors",
                s.isOverrun
                  ? "border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/10"
                  : "border-black/5 bg-black/[0.015] hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white">Table {t.tableNumber}</span>
                    <span className="truncate text-sm text-neutral-600 dark:text-neutral-300">{s.guestName}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Party {s.partySize}
                    {t.section ? ` · ${t.section.name}` : ""}
                  </p>
                </div>
                <span
                  className={cx(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-bold",
                    s.isOverrun
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "bg-black/5 text-neutral-500 dark:bg-white/10 dark:text-neutral-300"
                  )}
                >
                  {s.isOverrun ? `${minutesLabel(Math.abs(s.minutesRemaining))} over` : `${minutesLabel(s.minutesRemaining)} left`}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-neutral-400">Arrived</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">{timeOfDay(s.seatedAt, state.timezone)}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Seated</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">{minutesLabel(s.minutesSeated)} ago</p>
                </div>
                <div>
                  <p className="text-neutral-400">Finishes</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">{timeOfDay(s.expectedFinishAt, state.timezone)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
