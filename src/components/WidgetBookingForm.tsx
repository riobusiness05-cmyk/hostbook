"use client";

import { useRef, useState } from "react";

// Uses the RESTAURANT's timezone, not the visiting browser's — otherwise a
// guest booking from a different timezone could pick a date that reads as
// "today" locally but is already tomorrow (or vice versa) at the venue.
// (Same helper as ReservationForm.tsx — duplicated rather than imported so
// this file has zero dependency on the Colonial-themed guest site.)
function localDateStr(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// The embeddable widget's booking form — same booking flow and the same
// client-side hardening (idempotency key, stale-response guard) as the
// Colonial site's ReservationForm.tsx, but restyled to be a neutral,
// light-background card that won't visually clash when dropped into an
// arbitrary third-party website, and tinted with the restaurant's own
// brandColor rather than a fixed theme. Posts to the slug-scoped
// /api/widget/[slug]/* routes instead of the single-tenant /api/* ones.
export function WidgetBookingForm({
  slug,
  restaurantName,
  maxPartySize,
  timezone,
  brandColor,
}: {
  slug: string;
  restaurantName: string;
  maxPartySize: number;
  timezone: string;
  brandColor: string;
}) {
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
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const checkSeq = useRef(0);

  async function checkAvailability() {
    if (!date) return;
    const seq = ++checkSeq.current;
    setChecking(true);
    setStatus(null);
    setSelectedTime(null);
    try {
      const res = await fetch(`/api/widget/${slug}/availability?date=${date}&partySize=${partySize}`);
      const data = await res.json();
      if (seq !== checkSeq.current) return;
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
      const res = await fetch(`/api/widget/${slug}/reservations`, {
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
      idempotencyKeyRef.current = crypto.randomUUID();
      setSlots([]);
      setSelectedTime(null);
      setName("");
      setEmail("");
      setPhone("");
      setNotes("");
    } catch {
      setStatus({ type: "error", message: "Couldn't reach the server." });
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-[var(--hf-accent)] placeholder:text-neutral-400";

  return (
    <div
      className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-sm"
      style={{ "--hf-accent": brandColor } as React.CSSProperties}
    >
      <h3 className="text-lg font-semibold text-neutral-900">Reserve a table at {restaurantName}</h3>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-neutral-500">
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
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="block text-xs font-medium text-neutral-500">
          Party size
          <select
            value={partySize}
            onChange={(e) => {
              setPartySize(Number(e.target.value));
              setSlots([]);
              setSelectedTime(null);
            }}
            className={`mt-1 ${inputCls}`}
          >
            {Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
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
        className="mt-4 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: brandColor }}
      >
        {checking ? "Checking…" : "Check availability"}
      </button>

      {slots.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">Available times</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => {
              const isSelected = selectedTime === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedTime(s)}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={
                    isSelected
                      ? { backgroundColor: brandColor, borderColor: brandColor, color: "#fff" }
                      : { borderColor: "#e5e5e5", color: "#404040" }
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedTime && (
        <form onSubmit={submitReservation} className="mt-4 space-y-2.5">
          <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          <div className="grid grid-cols-2 gap-2.5">
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <textarea
            placeholder="Allergies, occasion, seating notes… (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            rows={2}
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: brandColor }}
          >
            {submitting ? "Booking…" : `Confirm table for ${partySize} at ${selectedTime}`}
          </button>
        </form>
      )}

      {status && (
        <p className={`mt-3 text-sm ${status.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{status.message}</p>
      )}

      <p className="mt-4 text-center text-[10px] text-neutral-300">
        Powered by{" "}
        <a href="https://hostflow-booking.vercel.app/hostflow" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-400">
          Host Flow
        </a>
      </p>
    </div>
  );
}
