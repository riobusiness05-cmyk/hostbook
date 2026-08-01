"use client";

import { useRef, useState } from "react";

// Uses the RESTAURANT's timezone, not the visiting browser's — otherwise a
// guest booking from a different timezone could pick a date that reads as
// "today" locally but is already tomorrow (or vice versa) at the venue.
function localDateStr(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function ReservationForm({ maxPartySize, timezone }: { maxPartySize: number; timezone: string }) {
  const todayStr = () => localDateStr(new Date(), timezone);
  const [date, setDate] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  // Stable for the lifetime of this booking attempt — a network retry or a
  // double-click that slips past the disabled-button guard reuses the same
  // key, so the server resolves it to one reservation instead of two.
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  // Guards against an out-of-order response: if the date/party size changes
  // again before an in-flight availability check returns, a slower earlier
  // response landing after a newer one would otherwise overwrite the
  // correct slots with stale ones.
  const checkSeq = useRef(0);

  async function checkAvailability() {
    if (!date) return;
    const seq = ++checkSeq.current;
    setChecking(true);
    setStatus(null);
    setSelectedTime(null);
    try {
      const res = await fetch(`/api/availability?date=${date}&partySize=${partySize}`);
      const data = await res.json();
      if (seq !== checkSeq.current) return; // a newer check superseded this one
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Couldn't check availability." });
        setSlots([]);
        return;
      }
      setSlots(data.slots);
      if (data.slots.length === 0) {
        setStatus({ type: "error", message: "No tables open for that date/party size. Try another date." });
      }
    } catch {
      if (seq !== checkSeq.current) return;
      setStatus({ type: "error", message: "Couldn't reach the server." });
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  }

  async function submitReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTime || !name.trim()) return;
    setSubmitting(true);
    setStatus(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time: selectedTime,
          partySize,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          notes,
          source: "WEB_FORM",
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Couldn't book that table." });
        return;
      }
      setStatus({
        type: "success",
        message: `You're booked for ${partySize} on ${date} at ${selectedTime}. A confirmation will be sent shortly.`,
      });
      // A confirmed booking — the next submit (if any) is a genuinely new
      // attempt, so it needs its own key rather than resolving to this one.
      idempotencyKeyRef.current = crypto.randomUUID();
      setSlots([]);
      setSelectedTime(null);
    } catch {
      setStatus({ type: "error", message: "Couldn't reach the server." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-sm border border-colonial-cream/15 bg-colonial-charcoal/60 p-8 backdrop-blur-sm">
      <h3 className="mb-6 font-serif text-xl font-light uppercase tracking-[0.12em] text-colonial-cream sm:text-2xl sm:tracking-[0.2em]">
        Reserve a Table
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs uppercase tracking-widest text-colonial-fade">
          Date
          <input
            type="date"
            min={todayStr()}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlots([]);
              setSelectedTime(null);
            }}
            className="rounded-sm border border-colonial-cream/20 bg-transparent px-3 py-2 text-sm text-colonial-cream [color-scheme:dark] focus:border-colonial-ember-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-widest text-colonial-fade">
          Party size
          <select
            value={partySize}
            onChange={(e) => {
              setPartySize(Number(e.target.value));
              setSlots([]);
              setSelectedTime(null);
            }}
            className="rounded-sm border border-colonial-cream/20 bg-transparent px-3 py-2 text-sm text-colonial-cream [color-scheme:dark] focus:border-colonial-ember-400 focus:outline-none"
          >
            {Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n} className="bg-colonial-charcoal text-colonial-cream">
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={checkAvailability}
        disabled={!date || checking}
        className="mt-4 w-full rounded-sm border border-colonial-ember-500 py-3 text-xs font-medium uppercase tracking-[0.25em] text-colonial-ember-300 transition-colors hover:bg-colonial-ember-500 hover:text-colonial-black disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-colonial-ember-300"
      >
        {checking ? "Checking…" : "Check Availability"}
      </button>

      {slots.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs uppercase tracking-widest text-colonial-fade">Available times</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedTime(s)}
                className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
                  selectedTime === s
                    ? "border-colonial-ember-500 bg-colonial-ember-500 text-colonial-black"
                    : "border-colonial-cream/20 text-colonial-cream/80 hover:border-colonial-ember-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedTime && (
        <form onSubmit={submitReservation} className="mt-5 space-y-3">
          <input
            required
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-sm border border-colonial-cream/20 bg-transparent px-3 py-2 text-sm text-colonial-cream placeholder:text-colonial-fade/50 focus:border-colonial-ember-400 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-sm border border-colonial-cream/20 bg-transparent px-3 py-2 text-sm text-colonial-cream placeholder:text-colonial-fade/50 focus:border-colonial-ember-400 focus:outline-none"
            />
            <input
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-sm border border-colonial-cream/20 bg-transparent px-3 py-2 text-sm text-colonial-cream placeholder:text-colonial-fade/50 focus:border-colonial-ember-400 focus:outline-none"
            />
          </div>
          <textarea
            placeholder="Allergies, special occasion, seating notes… (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-sm border border-colonial-cream/20 bg-transparent px-3 py-2 text-sm text-colonial-cream placeholder:text-colonial-fade/50 focus:border-colonial-ember-400 focus:outline-none"
            rows={2}
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-sm bg-colonial-ember-500 py-3 text-xs font-medium uppercase tracking-[0.25em] text-colonial-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {submitting ? "Booking…" : `Confirm Table for ${partySize} at ${selectedTime}`}
          </button>
        </form>
      )}

      {status && (
        <p
          className={`mt-4 text-sm ${status.type === "success" ? "text-colonial-ember-300" : "text-red-400"}`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
