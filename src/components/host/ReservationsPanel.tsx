"use client";

import { useEffect, useMemo, useState } from "react";
import type { FloorState, ReservationDTO } from "@/lib/hostflow/floor";
import { Button, Card, Chip, SectionTitle } from "./ui";
import { cx, localDateStr, minutesLabel, minutesOfDayInTz, timeOfDay } from "@/lib/host/format";
import { NewReservationForm } from "./NewReservationForm";
import * as api from "@/lib/host/client";

// All date/time grouping here is keyed off the RESTAURANT's timezone (see
// FloorState.timezone), not the viewing device's — otherwise a host on a
// device set to a different zone than the venue sees bookings grouped into
// the wrong day and displayed at the wrong time.
function dateLabel(iso: string, timeZone: string): string {
  const today = localDateStr(new Date().toISOString(), timeZone);
  const tomorrow = localDateStr(new Date(Date.now() + 24 * 60 * 60000).toISOString(), timeZone);
  const key = localDateStr(iso, timeZone);
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone });
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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
  const shiftStart = timeToMinutes(state.settings.nightShiftStartTime);
  // Defaults to whichever shift is "on" right now — after the shift-start
  // time, staff opening this tab almost always want tonight's bookings, not
  // this afternoon's.
  const [shift, setShift] = useState<"day" | "night">(() =>
    minutesOfDayInTz(new Date().toISOString(), state.timezone) >= shiftStart ? "night" : "day"
  );

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
  const todayKey = localDateStr(new Date().toISOString(), state.timezone);

  // Group by date, preserving chronological order — filtered to whichever
  // shift is selected (bookings before the shift-start time = day, at/after
  // = night). Applies to every date shown, not just today, so "tomorrow
  // night" is just as filterable as "tonight."
  const groups = useMemo(() => {
    const filtered = state.reservations.filter((r) =>
      shift === "night"
        ? minutesOfDayInTz(r.reservationTime, state.timezone) >= shiftStart
        : minutesOfDayInTz(r.reservationTime, state.timezone) < shiftStart
    );
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime()
    );
    const map = new Map<string, ReservationDTO[]>();
    for (const r of sorted) {
      const k = localDateStr(r.reservationTime, state.timezone);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    return Array.from(map.entries());
  }, [state.reservations, state.timezone, shift, shiftStart]);

  const dayCount = state.reservations.filter((r) => minutesOfDayInTz(r.reservationTime, state.timezone) < shiftStart).length;
  const nightCount = state.reservations.filter((r) => minutesOfDayInTz(r.reservationTime, state.timezone) >= shiftStart).length;

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

      <div className="mb-3 flex shrink-0 gap-1 rounded-xl border border-black/5 bg-white/60 p-1 dark:border-white/10 dark:bg-white/[0.03]">
        <button
          onClick={() => setShift("day")}
          className={cx(
            "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            shift === "day"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          )}
        >
          ☀️ Day · {dayCount}
        </button>
        <button
          onClick={() => setShift("night")}
          className={cx(
            "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            shift === "night"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          )}
        >
          🌙 Night · {nightCount}
        </button>
      </div>

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
        {adding && (
          <NewReservationForm
            timezone={state.timezone}
            sectionNames={state.sections.map((s) => s.name)}
            onDone={() => {
              setPaused?.(false);
              setAdding(false);
              refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {!adding && groups.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-400">No {shift} bookings.</p>
        )}

        {groups.map(([key, rows]) => (
          <div key={key} className="space-y-2">
            <div className="sticky top-0 z-[1] bg-white/80 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 backdrop-blur dark:bg-neutral-950/80 dark:text-neutral-400">
              {dateLabel(rows[0].reservationTime, state.timezone)} · {rows.length}
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
                        {timeOfDay(r.reservationTime, state.timezone)}
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
                      title={
                        tableNo
                          ? r.comboTableNumbers.length > 0
                            ? `Combined with Table ${r.comboTableNumbers.join(", Table ")} — go to Table ${tableNo}`
                            : `Go to Table ${tableNo}`
                          : "No table assigned"
                      }
                    >
                      {tableNo
                        ? r.comboTableNumbers.length > 0
                          ? `Tables ${[tableNo, ...r.comboTableNumbers].join("+")}`
                          : `Table ${tableNo}`
                        : "Unassigned"}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-amber-600 dark:text-amber-400"
                      disabled={busyId === r.id}
                      onClick={() => act(r.id, "NO_SHOW")}
                    >
                      No show
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
