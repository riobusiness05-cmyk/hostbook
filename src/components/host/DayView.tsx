"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DayPlan } from "@/lib/hostflow/dayplan";
import { fetchDayPlan } from "@/lib/host/client";
import { Card, StatCard } from "./ui";
import { FloorPlan } from "./FloorPlan";
import { cx } from "@/lib/host/format";

// Booking-planning view for a future date. The floor shows which tables are
// booked (blue) vs free (green) that day; the rail lists the day's bookings.
export function DayView({ date, dateLabel }: { date: string; dateLabel: string }) {
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await fetchDayPlan(date);
      setPlan(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    setPlan(null);
    setSelectedTableId(null);
    load();
  }, [load]);

  const bookings = useMemo(() => {
    if (!plan) return [];
    return selectedTableId ? plan.bookings.filter((b) => b.tableId === selectedTableId) : plan.bookings;
  }, [plan, selectedTableId]);

  if (error) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-500">{error}</div>;
  }
  if (!plan) {
    return <div className="grid h-64 place-items-center text-sm text-neutral-400">Loading {dateLabel}…</div>;
  }

  const m = plan.metrics;
  const selectedTableNo = selectedTableId ? plan.tables.find((t) => t.id === selectedTableId)?.tableNumber : null;

  return (
    <div className="space-y-3">
      {/* Day metrics */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
        <StatCard label="Bookings" value={m.bookings} sub={dateLabel} />
        <StatCard label="Covers booked" value={m.covers} accent="#3b82f6" />
        <StatCard label="Tables booked" value={`${m.tablesBooked}/${m.tablesTotal}`} />
        <StatCard label="Peak time" value={m.peakLabel} sub={m.peakCovers ? `${m.peakCovers} covers` : undefined} tone="warn" />
        <StatCard label="First seating" value={m.firstSeating ?? "—"} />
        <StatCard label="Last seating" value={m.lastSeating ?? "—"} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_384px]">
        {/* Floor — booked vs free for the day */}
        <div className="h-[62vh] min-h-[420px] lg:h-[calc(100vh-300px)]">
          <FloorPlan
            tables={plan.tables}
            sections={plan.sections}
            selectedId={selectedTableId}
            onSelect={(id) => setSelectedTableId((cur) => (cur === id ? null : id))}
            refresh={load}
            setPaused={() => {}}
          />
        </div>

        {/* Day bookings list */}
        <div className="h-[70vh] min-h-[480px] lg:h-[calc(100vh-300px)]">
          <Card className="flex h-full flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {selectedTableNo ? `Table ${selectedTableNo} · ${bookings.length}` : `Bookings · ${plan.bookings.length}`}
              </h2>
              {selectedTableId && (
                <button onClick={() => setSelectedTableId(null)} className="text-xs text-sky-600 hover:underline dark:text-sky-400">
                  Show all
                </button>
              )}
            </div>

            {/* By-area summary */}
            {!selectedTableId && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {m.byArea.filter((a) => a.bookings > 0).map((a) => (
                  <span key={a.name} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${a.color}22`, color: a.color }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.name} {a.bookings}
                  </span>
                ))}
              </div>
            )}

            <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
              {bookings.length === 0 && (
                <p className="py-6 text-center text-sm text-neutral-400">No bookings {selectedTableId ? "for this table" : `on ${dateLabel.toLowerCase()}`}.</p>
              )}
              {bookings.map((b) => (
                <div key={b.id} className="rounded-xl border border-black/5 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="text-base font-bold tabular-nums text-neutral-900 dark:text-white">{b.time}</span>
                      <span className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">{b.customerName}</span>
                    </div>
                    <button
                      onClick={() => b.tableId && setSelectedTableId(b.tableId)}
                      disabled={!b.tableNumber}
                      className={cx(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-bold",
                        b.tableNumber ? "bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 dark:text-blue-300" : "bg-black/5 text-neutral-400 dark:bg-white/10"
                      )}
                    >
                      {b.tableNumber ? `Table ${b.tableNumber}` : "Unassigned"}
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>Party {b.partySize}</span>
                    {b.sectionName && <span>· {b.sectionName}</span>}
                    {b.occasion && <span>· {b.occasion}</span>}
                    {b.isVip && <span className="font-semibold text-purple-500">· VIP</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
