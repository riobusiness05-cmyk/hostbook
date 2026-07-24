"use client";

import { useEffect, useMemo, useState } from "react";
import type { FloorState, ReservationDTO } from "@/lib/hostflow/floor";
import { Button, Card, Chip, SectionTitle } from "./ui";
import { cx, minutesLabel, timeOfDay } from "@/lib/host/format";
import { NewReservationForm } from "./NewReservationForm";
import * as api from "@/lib/host/client";

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (dateKey(iso) === dateKey(today.toISOString())) return "Today";
  if (dateKey(iso) === dateKey(tomorrow.toISOString())) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Reservations grouped by date (Today, Tomorrow, then future dates), each row
// showing the held table and time. Includes a "New reservation" form so staff
// can take a booking for any future date from inside the host app.
export function ReservationsPanel({
  state,
  refresh,
  onSelectTable,
  setPaused,
}: {
  state: FloorState;
  refresh: () => Promise<void>;
  onSelectTable: (id: string) => void;
  setPaused?: (v: boolean) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Pause live refreshes while the New Reservation form is open so a tick
  // doesn't wipe a booking mid-entry.
  useEffect(() => {
    setPaused?.(adding);
    return () => setPaused?.(false);
  }, [adding, setPaused]);

  const tableNumberById = useMemo(
    () => new Map(state.tables.map((t) => [t.id, t.tableNumber])),
    [state.tables]
  );
  const todayKey = dateKey(new Date().toISOString());

  // Group by date, preserving chronological order.
  const groups = useMemo(() => {
    const sorted = [...state.reservations].sort(
      (a, b) => new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime()
    );
    const map = new Map<string, ReservationDTO[]>();
    for (const r of sorted) {
      const k = dateKey(r.reservationTime);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    return Array.from(map.entries());
  }, [state.reservations]);

  const act = async (id: string, status: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.setReservationStatus(id, status);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="flex h-full flex-col p-4">
      <SectionTitle
        action={
          <Button size="sm" variant={adding ? "ghost" : "primary"} onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "+ New reservation"}
          </Button>
        }
      >
        Reservations · {state.reservations.length}
      </SectionTitle>

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
        {adding && (
          <NewReservationForm
            onDone={() => {
              setPaused?.(false);
              setAdding(false);
              refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {!adding && groups.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-400">No reservations booked.</p>
        )}

        {groups.map(([key, rows]) => (
          <div key={key} className="space-y-2">
            <div className="sticky top-0 z-[1] bg-white/80 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 backdrop-blur dark:bg-neutral-950/80 dark:text-neutral-400">
              {dateLabel(rows[0].reservationTime)} · {rows.length}
            </div>
            {rows.map((r) => {
              const tableNo = r.tableId ? tableNumberById.get(r.tableId) : undefined;
              const isToday = key === todayKey;
              return (
                <div
                  key={r.id}
                  className={cx(
                    "rounded-xl border p-3",
                    r.isLate
                      ? "border-purple-500/30 bg-purple-500/[0.06]"
                      : "border-black/5 bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="text-base font-bold tabular-nums text-neutral-900 dark:text-white">
                        {timeOfDay(r.reservationTime)}
                      </span>
                      <span className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
                        {r.customerName}
                      </span>
                    </div>
                    <button
                      onClick={() => r.tableId && onSelectTable(r.tableId)}
                      disabled={!r.tableId}
                      className={cx(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-bold",
                        tableNo
                          ? "bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 dark:text-blue-300"
                          : "bg-black/5 text-neutral-400 dark:bg-white/10"
                      )}
                      title={tableNo ? `Go to Table ${tableNo}` : "No table assigned"}
                    >
                      {tableNo ? `Table ${tableNo}` : "Unassigned"}
                    </button>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>Party {r.partySize}</span>
                    {isToday && (
                      <>
                        <span>·</span>
                        {r.isLate ? (
                          <Chip color="#a855f7">{minutesLabel(Math.abs(r.minutesUntil))} late</Chip>
                        ) : r.minutesUntil <= 15 ? (
                          <Chip color="#f97316">arriving in {minutesLabel(r.minutesUntil)}</Chip>
                        ) : (
                          <span>in {minutesLabel(r.minutesUntil)}</span>
                        )}
                      </>
                    )}
                    {r.occasion && <span>· {r.occasion}</span>}
                    {r.seatingPreference && <span>· {r.seatingPreference}</span>}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="primary" className="flex-1" disabled={busyId === r.id} onClick={() => act(r.id, "ARRIVED")}>
                      Mark arrived
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => act(r.id, "CANCELLED")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
