"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";
import { OCCASIONS } from "@/types";
import { localDateStr } from "@/lib/host/format";
import * as api from "@/lib/host/client";

const NO_PREFERENCE = "No preference";

const input =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white";

// Host-side "make a future reservation" form: pick a date + party size, check
// real availability for the venue, choose a time, capture guest details, book.
export function NewReservationForm({
  timezone,
  sectionNames,
  onDone,
  onCancel,
}: {
  timezone: string;
  sectionNames: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const todayStr = () => localDateStr(new Date().toISOString(), timezone);
  const [date, setDate] = useState(todayStr());
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ tableNumber: number; comboTableNumbers: number[]; time: string } | null>(null);

  // Guest details
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState("None");
  const [seating, setSeating] = useState(NO_PREFERENCE);
  const [highChair, setHighChair] = useState(false);
  const [notes, setNotes] = useState("");
  // Stable for the lifetime of this booking attempt — a network retry or a
  // double-click that slips past the disabled-button guard reuses the same
  // key, so the server resolves it to one reservation instead of two. Only
  // regenerated when the host explicitly starts a new booking ("Add another").
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  // Guards against an out-of-order response: if the date/party size changes
  // again before an in-flight check returns, a slower earlier response
  // landing after a newer one would otherwise overwrite the correct slots.
  const checkSeq = useRef(0);

  async function findTimes() {
    const seq = ++checkSeq.current;
    setChecking(true);
    setError(null);
    setSlots(null);
    setTime(null);
    try {
      const s = await api.fetchReservationSlots(date, partySize);
      if (seq !== checkSeq.current) return; // a newer check superseded this one
      setSlots(s);
      if (s.length === 0) setError("No availability for that date/party size. Try another date.");
    } catch (e) {
      if (seq !== checkSeq.current) return;
      setError((e as Error).message);
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  }

  async function book() {
    if (!time || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.createReservation({
        date,
        time,
        partySize,
        customerName: name.trim(),
        customerPhone: phone || undefined,
        occasion: occasion !== "None" ? occasion : undefined,
        seatingPreference: seating !== NO_PREFERENCE ? seating : undefined,
        highChair: highChair || undefined,
        notes: notes || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setDone({ tableNumber: r.tableNumber, comboTableNumbers: r.comboTableNumbers, time: r.time });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <p className="font-semibold text-emerald-700 dark:text-emerald-300">Booking confirmed ✓</p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-300">
          {name} · party of {partySize} · {date} at {done.time} —{" "}
          {done.comboTableNumbers.length > 0
            ? `Tables ${[done.tableNumber, ...done.comboTableNumbers].join(" + ")} (combined)`
            : `Table ${done.tableNumber}`}
          .
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={onDone}>Done</Button>
          <Button
            variant="ghost"
            onClick={() => {
              idempotencyKeyRef.current = crypto.randomUUID();
              setDone(null);
              setName("");
              setPhone("");
              setNotes("");
              setTime(null);
              setSlots(null);
            }}
          >
            Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500 dark:text-neutral-400">
          Date
          <input type="date" min={todayStr()} value={date} onChange={(e) => { setDate(e.target.value); setSlots(null); setTime(null); }} className={input + " [color-scheme:light] dark:[color-scheme:dark]"} />
        </label>
        <label className="text-xs text-neutral-500 dark:text-neutral-400">
          Party size
          <select value={partySize} onChange={(e) => { setPartySize(Number(e.target.value)); setSlots(null); setTime(null); }} className={input}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>
            ))}
          </select>
        </label>
      </div>

      <Button variant="secondary" className="w-full" onClick={findTimes} disabled={checking}>
        {checking ? "Checking availability…" : "Find available times"}
      </Button>

      {slots && slots.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Available times</p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {slots.map((s) => (
              <button
                key={s}
                onClick={() => setTime(s)}
                className={
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
                  (time === s
                    ? "border-sky-500 bg-sky-500 text-white"
                    : "border-black/10 text-neutral-700 hover:border-sky-400 dark:border-white/15 dark:text-neutral-200")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {time && (
        <div className="space-y-2 border-t border-black/5 pt-3 dark:border-white/10">
          <input className={input} placeholder="Guest name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className={input} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
              {OCCASIONS.map((o) => <option key={o} value={o}>{o === "None" ? "Occasion" : o}</option>)}
            </select>
            <select className={input} value={seating} onChange={(e) => setSeating(e.target.value)}>
              {[NO_PREFERENCE, ...sectionNames].map((s) => <option key={s} value={s}>{s === NO_PREFERENCE ? "Seating pref" : s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
            <input type="checkbox" checked={highChair} onChange={(e) => setHighChair(e.target.checked)} /> High chair needed
          </label>
          <input className={input} placeholder="Notes (allergies, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={!time || !name.trim() || saving} onClick={book}>
          {saving ? "Booking…" : "Create booking"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
