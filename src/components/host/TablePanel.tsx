"use client";

import { useEffect, useState } from "react";
import type { FloorState, TableDTO } from "@/lib/hostflow/floor";
import { STATUS_META } from "@/lib/hostflow/constants";
import { Button, Chip } from "./ui";
import { cx, minutesLabel, money, timeOfDay } from "@/lib/host/format";
import * as api from "@/lib/host/client";

type Mode = "idle" | "seat" | "move" | "merge";

export function TablePanel({
  table,
  state,
  onClose,
  refresh,
}: {
  table: TableDTO;
  state: FloorState;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient UI whenever a different table is opened.
  useEffect(() => {
    setMode("idle");
    setError(null);
  }, [table.id]);

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
            <Row label="Seated">{timeOfDay(s.seatedAt)} · {minutesLabel(s.minutesSeated)} ago</Row>
            <Row label="Expected finish">{timeOfDay(s.expectedFinishAt)}</Row>
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
            <Row label="Time">{timeOfDay(r.reservationTime)} · {r.isLate ? `${minutesLabel(Math.abs(r.minutesUntil))} late` : `in ${minutesLabel(r.minutesUntil)}`}</Row>
            {r.occasion && <Row label="Occasion">{r.occasion}</Row>}
            {r.seatingPreference && <Row label="Preference">{r.seatingPreference}</Row>}
            {r.accessibilityNeeds && <Row label="Accessibility">{r.accessibilityNeeds}</Row>}
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
            onPick={(toId) => run(() => api.tableAction(table.id, { action: "move", toTableId: toId }))}
          />
        )}

        {mode === "merge" && (
          <TablePicker
            label="Merge with"
            options={state.tables.filter((t) => t.id !== table.id && t.isJoinable && t.status !== "OCCUPIED")}
            busy={busy}
            onCancel={() => setMode("idle")}
            onPick={(otherId) => run(() => api.tableAction(table.id, { action: "merge", otherTableId: otherId }))}
          />
        )}
      </div>

      {/* Action bar */}
      {mode === "idle" && (
        <div className="border-t border-black/5 p-3 dark:border-white/10">
          <div className="grid grid-cols-2 gap-2">
            {!s && table.status !== "BLOCKED" && (
              <Button variant="primary" className="col-span-2" onClick={() => setMode("seat")} disabled={busy}>
                {r ? `Seat ${r.customerName}` : "Seat guests"}
              </Button>
            )}
            {r && !s && (
              <>
                <Button onClick={() => run(() => api.setReservationStatus(r.id, "ARRIVED"))} disabled={busy}>
                  Mark arrived
                </Button>
                <Button variant="danger" onClick={() => run(() => api.setReservationStatus(r.id, "CANCELLED"))} disabled={busy}>
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
            <Button onClick={() => setMode("merge")} disabled={busy}>Merge</Button>
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

function TablePicker({
  label,
  options,
  busy,
  onPick,
  onCancel,
}: {
  label: string;
  options: TableDTO[];
  busy: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <p className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">{label}</p>
      {options.length === 0 ? (
        <p className="text-sm text-neutral-500">No eligible tables.</p>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {options.map((t) => (
            <button
              key={t.id}
              disabled={busy}
              onClick={() => onPick(t.id)}
              className="rounded-lg border border-black/10 p-2 text-center text-sm hover:border-sky-500 hover:bg-sky-500/5 disabled:opacity-50 dark:border-white/10"
            >
              <div className="font-bold text-neutral-900 dark:text-white">T{t.tableNumber}</div>
              <div className="text-[10px] text-neutral-500">{t.seatsMax} seats</div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-3">
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
