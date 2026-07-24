"use client";

import { useState } from "react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReservationForm({ maxPartySize }: { maxPartySize: number }) {
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

  async function checkAvailability() {
    if (!date) return;
    setChecking(true);
    setStatus(null);
    setSelectedTime(null);
    try {
      const res = await fetch(`/api/availability?date=${date}&partySize=${partySize}`);
      const data = await res.json();
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
      setStatus({ type: "error", message: "Couldn't reach the server." });
    } finally {
      setChecking(false);
    }
  }

  async function submitReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTime || !name) return;
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
            disabled={submitting || !name}
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
