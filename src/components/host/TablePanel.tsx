"use client";

import { useEffect, useState } from "react";
import type { FloorState, TableDTO } from "@/lib/hostflow/floor";
import { STATUS_META } from "@/lib/hostflow/constants";
import { Button, Chip } from "./ui";
import { cx, localDateStr, minutesLabel, money, timeOfDay } from "@/lib/host/format";
import * as api from "@/lib/host/client";

type Mode = "idle" | "seat" | "move" | "merge" | "reserve";

export function TablePanel({
  table,
  state,
  onClose,
  refresh,
  setPaused,
}: {
  table: TableDTO;
  state: FloorState;
  onClose: () => void;
  refresh: () => Promise<void>;
  setPaused: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient UI whenever a different table is opened.
  useEffect(() => {
    setMode("idle");
    setError(null);
  }, [table.id]);

  // Any open form (seat/move/merge/reserve) is mid-composition — a live
  // floor refresh landing while the host is filling one in would reset the
  // native date/time inputs' partial in-progress entry, since React
  // re-applies the (still-unchanged) controlled value on every re-render.
  // Same pattern as FloorPlan's edit-mode pause.
  useEffect(() => {
    setPaused(mode !== "idle");
    return () => setPaused(false);
  }, [mode, setPaused]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      setMode("idle");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const meta = STATUS_META[table.status];
  const s = table.session;
  const r = table.reservation;
  const ur = table.upcomingReservation;
  const mergedChildren = state.tables.filter((t) => t.mergedIntoId === table.id);
  const mergedIntoTable = table.mergedIntoId ? state.tables.find((t) => t.id === table.mergedIntoId) ?? null : null;

  return (
    <aside className="flex h-full w-full flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-black/5 p-4 dark:border-white/10">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Table {table.tableNumber}</h2>
            <Chip color={meta?.color}>{meta?.label}</Chip>
          </div>
          <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
            {table.name} · seats {table.seatsMin}–{table.seatsMax}
            {table.section ? ` · ${table.section.name}` : ""}
          </p>
          {table.server && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: table.server.color }} />
              Served by {table.server.name}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Close panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Current guests */}
        {s && (
          <DetailBlock title="Current guests">
            <Row label="Guest">{s.guestName}</Row>
            <Row label="Party size">{s.partySize}</Row>
            <Row label="Seated">{timeOfDay(s.seatedAt, state.timezone)} · {minutesLabel(s.minutesSeated)} ago</Row>
            <Row label="Expected finish">{timeOfDay(s.expectedFinishAt, state.timezone)}</Row>
            <Row label="Dining time">
              <span className={cx(s.isOverrun && "font-semibold text-red-600 dark:text-red-400")}>
                {s.isOverrun ? `${minutesLabel(Math.abs(s.minutesRemaining))} over` : `${minutesLabel(s.minutesRemaining)} left`}
              </span>
            </Row>
            {s.occasion && <Row label="Occasion">{s.occasion}</Row>}
            {s.currentBill != null && <Row label="Current bill">{money(s.currentBill)}</Row>}
          </DetailBlock>
        )}

        {s?.waitingForOutdoor && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm font-medium text-teal-700 dark:text-teal-300">
            <span>🌿</span> Waiting for an outdoor table to eat
          </div>
        )}

        {/* Held reservation */}
        {r && !s && (
          <DetailBlock title="Reservation">
            <Row label="Name">{r.customerName}</Row>
            <Row label="Party size">{r.partySize}</Row>
            <Row label="Time">{timeOfDay(r.reservationTime, state.timezone)} · {r.isLate ? `${minutesLabel(Math.abs(r.minutesUntil))} late` : `in ${minutesLabel(r.minutesUntil)}`}</Row>
            {r.occasion && <Row label="Occasion">{r.occasion}</Row>}
            {r.seatingPreference && <Row label="Preference">{r.seatingPreference}</Row>}
            {r.accessibilityNeeds && <Row label="Accessibility">{r.accessibilityNeeds}</Row>}
          </DetailBlock>
        )}

        {/* Booked later today — informational only, table is still open for walk-ins */}
        {ur && !s && !r && (
          <DetailBlock title="Booked later today">
            <Row label="Name">{ur.customerName}</Row>
            <Row label="Party size">{ur.partySize}</Row>
            <Row label="Time">{timeOfDay(ur.reservationTime, state.timezone)} · in {minutesLabel(ur.minutesUntil)}</Row>
            {ur.occasion && <Row label="Occasion">{ur.occasion}</Row>}
          </DetailBlock>
        )}

        {table.notes && (
          <DetailBlock title="Notes">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{table.notes}</p>
          </DetailBlock>
        )}

        {/* Inline forms */}
        {mode === "seat" && (
          <SeatForm
            table={table}
            reservation={r}
            busy={busy}
            onCancel={() => setMode("idle")}
            onSubmit={(input) =>
              run(() =>
                api.tableAction(table.id, {
                  action: "seat",
                  guestName: input.guestName,
                  partySize: input.partySize,
                  source: r ? "RESERVATION" : "WALKIN",
                  reservationId: r && r.tableId === table.id ? r.id : undefined,
                  occasion: input.occasion || undefined,
                })
              )
            }
          />
        )}

        {mode === "move" && s && (
          <TablePicker
            label="Move guests to"
            options={state.tables.filter((t) => t.id !== table.id && t.status === "AVAILABLE" && t.seatsMax >= s.partySize)}
            busy={busy}
            onCancel={() => setMode("idle")}
            onPick={(ids) => run(() => api.tableAction(table.id, { action: "move", toTableId: ids[0] }))}
          />
        )}

        {mode === "merge" && (
          <TablePicker
            label="Combine with (pick 1 or more)"
            multi
            baseSeats={table.seatsMax}
            options={state.tables.filter(
              (t) => t.id !== table.id && t.isJoinable && t.status !== "OCCUPIED" && !t.reservation && t.section?.id === table.section?.id
            )}
            busy={busy}
            onCancel={() => setMode("idle")}
            onPick={(ids) =>
              run(async () => {
                // Sequential, not parallel — each merge reads the primary
                // table's current capacity fresh, so folding three tables in
                // at once has to happen one at a time to add up correctly.
                for (const otherId of ids) {
                  await api.tableAction(table.id, { action: "merge", otherTableId: otherId });
                }
              })
            }
          />
        )}

        {mode === "reserve" && (
          <ReserveForm
            table={table}
            timezone={state.timezone}
            busy={busy}
            onCancel={() => setMode("idle")}
            onSubmit={(input) =>
              run(() =>
                api.tableAction(table.id, {
                  action: "reserve",
                  date: input.date,
                  time: input.time,
                  partySize: input.partySize,
                  customerName: input.customerName,
                  customerPhone: input.customerPhone || undefined,
                  occasion: input.occasion || undefined,
                })
              )
            }
          />
        )}
      </div>

      {/* Action bar */}
      {mode === "idle" && mergedIntoTable && (
        <div className="border-t border-black/5 p-3 dark:border-white/10">
          <p className="mb-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
            Combined into Table {mergedIntoTable.tableNumber} — split there to seat it separately again.
          </p>
          <Button
            className="w-full"
            onClick={() => run(() => api.tableAction(mergedIntoTable.id, { action: "split" }))}
            disabled={busy}
          >
            Split from Table {mergedIntoTable.tableNumber}
          </Button>
        </div>
      )}
      {mode === "idle" && !mergedIntoTable && (
        <div className="border-t border-black/5 p-3 dark:border-white/10">
          <div className="grid grid-cols-2 gap-2">
            {!s && !r && table.status !== "BLOCKED" && (
              <>
                <Button variant="primary" onClick={() => setMode("seat")} disabled={busy}>
                  Seat guests
                </Button>
                <Button onClick={() => setMode("reserve")} disabled={busy}>
                  Reserve table
                </Button>
              </>
            )}
            {!s && r && (
              <Button variant="primary" className="col-span-2" onClick={() => setMode("seat")} disabled={busy}>
                Seat {r.customerName}
              </Button>
            )}
            {r && !s && (
              <>
                <Button onClick={() => run(() => api.setReservationStatus(r.id, "ARRIVED"))} disabled={busy}>
                  Mark arrived
                </Button>
                <Button
                  className="text-amber-600 dark:text-amber-400"
                  onClick={() => run(() => api.setReservationStatus(r.id, "NO_SHOW"))}
                  disabled={busy}
                >
                  No show
                </Button>
                <Button
                  variant="danger"
                  className="col-span-2"
                  onClick={() => run(() => api.setReservationStatus(r.id, "CANCELLED"))}
                  disabled={busy}
                >
                  Cancel booking
                </Button>
              </>
            )}
            {s && (
              <>
                <Button onClick={() => setMode("move")} disabled={busy}>Move guests</Button>
                <Button variant="danger" onClick={() => run(() => api.tableAction(table.id, { action: "release" }))} disabled={busy}>
                  Finish & release
                </Button>
                <Button
                  className="col-span-2"
                  onClick={() => run(() => api.tableAction(table.id, { action: "waitOutside", waiting: !s.waitingForOutdoor }))}
                  disabled={busy}
                >
                  {s.waitingForOutdoor ? "🌿 Cancel outdoor wait" : "🌿 Waiting for outdoor table"}
                </Button>
              </>
            )}
            {/* Booking a table for a different date/time should always be
                reachable, even while it's currently occupied or already
                has a near-term reservation — the reserve form's own date
                picker (min = today) and bookSpecificTable's date-scoped
                availability check already handle "is this table actually
                free at THAT time" correctly; the only thing missing was a
                way to open the form at all in these states. */}
            {(s || r) && table.status !== "BLOCKED" && (
              <Button className="col-span-2" onClick={() => setMode("reserve")} disabled={busy}>
                Reserve for another time
              </Button>
            )}
            {mergedChildren.length > 0 ? (
              <Button
                className="col-span-2"
                onClick={() => run(() => api.tableAction(table.id, { action: "split" }))}
                disabled={busy}
              >
                Split tables ({mergedChildren.map((t) => `T${t.tableNumber}`).join(", ")})
              </Button>
            ) : (
              state.settings.tableMergingEnabled && (
                <Button onClick={() => setMode("merge")} disabled={busy}>Merge</Button>
              )
            )}
            {table.status === "DIRTY" ? (
              <Button onClick={() => run(() => api.tableAction(table.id, { action: "markClean" }))} disabled={busy}>
                Start cleaning
              </Button>
            ) : table.status === "CLEANING" ? (
              <Button onClick={() => run(() => api.tableAction(table.id, { action: "release" }))} disabled={busy}>
                Mark clean
              </Button>
            ) : (
              <Button onClick={() => run(() => api.tableAction(table.id, { action: "markDirty" }))} disabled={busy}>
                Mark dirty
              </Button>
            )}
            {table.status === "BLOCKED" ? (
              <Button onClick={() => run(() => api.tableAction(table.id, { action: "release" }))} disabled={busy}>
                Unblock
              </Button>
            ) : (
              <Button onClick={() => run(() => api.tableAction(table.id, { action: "block" }))} disabled={busy}>
                Block
              </Button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">{children}</span>
    </div>
  );
}

function SeatForm({
  table,
  reservation,
  busy,
  onSubmit,
  onCancel,
}: {
  table: TableDTO;
  reservation: TableDTO["reservation"];
  busy: boolean;
  onSubmit: (v: { guestName: string; partySize: number; occasion: string }) => void;
  onCancel: () => void;
}) {
  const [guestName, setGuestName] = useState(reservation?.customerName ?? "");
  const [partySize, setPartySize] = useState(reservation?.partySize ?? Math.min(2, table.seatsMax));
  const [occasion, setOccasion] = useState(reservation?.occasion ?? "");

  return (
    <div className="mb-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <p className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Seat guests at Table {table.tableNumber}</p>
      <div className="space-y-2.5">
        <Field label="Guest name">
          <input className={inputCls} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Name on the party" />
        </Field>
        <Field label={`Party size (max ${table.seatsMax})`}>
          <input
            type="number"
            min={1}
            max={table.seatsMax}
            className={inputCls}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </Field>
        <Field label="Occasion (optional)">
          <input className={inputCls} value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Birthday, anniversary…" />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !guestName.trim() || partySize < 1}
          onClick={() => onSubmit({ guestName: guestName.trim(), partySize, occasion })}
        >
          Seat
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

function ReserveForm({
  table,
  timezone,
  busy,
  onSubmit,
  onCancel,
}: {
  table: TableDTO;
  timezone: string;
  busy: boolean;
  onSubmit: (v: {
    date: string;
    time: string;
    partySize: number;
    customerName: string;
    customerPhone: string;
    occasion: string;
  }) => void;
  onCancel: () => void;
}) {
  const todayStr = () => localDateStr(new Date().toISOString(), timezone);
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(Math.min(2, table.seatsMax));
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [occasion, setOccasion] = useState("");

  return (
    <div className="mb-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <p className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Reserve Table {table.tableNumber}</p>
      <div className="space-y-2.5">
        <Field label="Guest name">
          <input className={inputCls} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name on the booking" />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Date">
            <input type="date" min={todayStr()} className={inputCls + " [color-scheme:light] dark:[color-scheme:dark]"} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <input type="time" className={inputCls + " [color-scheme:light] dark:[color-scheme:dark]"} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label={`Party size (${table.seatsMin}–${table.seatsMax})`}>
          <input
            type="number"
            min={table.seatsMin}
            max={table.seatsMax}
            className={inputCls}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </Field>
        <Field label="Phone (optional)">
          <input className={inputCls} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="For a confirmation call/text" />
        </Field>
        <Field label="Occasion (optional)">
          <input className={inputCls} value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Birthday, anniversary…" />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !customerName.trim() || !time || partySize < table.seatsMin}
          onClick={() => onSubmit({ date, time, partySize, customerName: customerName.trim(), customerPhone: customerPhone.trim(), occasion })}
        >
          Reserve
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

function TablePicker({
  label,
  options,
  busy,
  multi = false,
  baseSeats,
  onPick,
  onCancel,
}: {
  label: string;
  options: TableDTO[];
  busy: boolean;
  multi?: boolean;
  baseSeats?: number;
  onPick: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    if (!multi) {
      onPick([id]);
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const combinedSeats =
    baseSeats != null
      ? baseSeats + selected.reduce((sum, id) => sum + (options.find((t) => t.id === id)?.seatsMax ?? 0), 0)
      : null;

  return (
    <div className="mb-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <p className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">{label}</p>
      {options.length === 0 ? (
        <p className="text-sm text-neutral-500">No eligible tables.</p>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {options.map((t) => {
            const isSelected = selected.includes(t.id);
            return (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => toggle(t.id)}
                className={cx(
                  "rounded-lg border p-2 text-center text-sm disabled:opacity-50",
                  isSelected
                    ? "border-sky-500 bg-sky-500/10 dark:border-sky-400 dark:bg-sky-400/10"
                    : "border-black/10 hover:border-sky-500 hover:bg-sky-500/5 dark:border-white/10"
                )}
              >
                <div className="font-bold text-neutral-900 dark:text-white">T{t.tableNumber}</div>
                <div className="text-[10px] text-neutral-500">{t.seatsMax} seats</div>
              </button>
            );
          })}
        </div>
      )}
      {multi && combinedSeats != null && selected.length > 0 && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Combined: {combinedSeats} seats across {selected.length + 1} tables
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {multi && (
          <Button
            variant="primary"
            disabled={busy || selected.length === 0}
            onClick={() => onPick(selected)}
          >
            {selected.length > 0 ? `Combine ${selected.length + 1} tables` : "Select tables"}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white";
