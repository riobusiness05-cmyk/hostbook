"use client";

import { useRef, useState } from "react";
import { NoShowCardField, type NoShowCardFieldHandle } from "./NoShowCardField";

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
  noShowProtection,
}: {
  slug: string;
  restaurantName: string;
  maxPartySize: number;
  timezone: string;
  brandColor: string;
  noShowProtection: { feeCents: number; minPartySize: number } | null;
}) {
  const todayStr = () => localDateStr(new Date(), timezone);
  const [date, setDate] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<string[]>([]);
  // Which named areas (Main Terrace, Restaurant…) still have room at each
  // time — a full area simply isn't offered, and a chosen one is honoured
  // by the server, not treated as a hint.
  const [areasByTime, setAreasByTime] = useState<Record<string, string[]>>({});
  // Every area the venue lets guests choose, with its one-line description.
  const [areas, setAreas] = useState<{ name: string; note: string | null }[]>([]);
  const [areasCustomised, setAreasCustomised] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [area, setArea] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const checkSeq = useRef(0);
  const cardFieldRef = useRef<NoShowCardFieldHandle>(null);
  const requiresCard = !!noShowProtection && partySize >= noShowProtection.minPartySize;

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
      setAreasByTime(data.areasByTime ?? {});
      setAreas(Array.isArray(data.areas) ? data.areas : []);
      setAreasCustomised(!!data.areasCustomised);
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
      let stripeSetupIntentId: string | undefined;
      if (requiresCard) {
        try {
          stripeSetupIntentId = await cardFieldRef.current?.confirmSetup();
        } catch (err) {
          setStatus({ type: "error", message: (err as Error).message });
          return;
        }
      }

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
          seatingPreference: area || undefined,
          language: typeof navigator !== "undefined" ? navigator.language.slice(0, 2).toLowerCase() : undefined,
          idempotencyKey: idempotencyKeyRef.current,
          stripeSetupIntentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Couldn't book that table." });
        return;
      }
      setStatus({
        type: "success",
        message: `You're booked for ${partySize} on ${date} at ${selectedTime}${area ? ` (${area})` : ""}. A confirmation will be sent shortly.`,
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      setSlots([]);
      setAreasByTime({});
      setSelectedTime(null);
      setArea("");
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

  // Only worth asking when the venue actually has more than one area.
  const venueHasAreas = areas.length >= 2 || new Set(Object.values(areasByTime).flat()).size >= 2;
  const openAreas = selectedTime ? areasByTime[selectedTime] ?? [] : [];
  // Areas in the venue's order; anything open at this time that the list
  // doesn't know about (older servers) is appended so nothing is hidden.
  const areaChoices = [
    ...areas,
    ...openAreas.filter((n) => !areas.some((a) => a.name === n)).map((n) => ({ name: n, note: null as string | null })),
  ];

  function pickTime(time: string) {
    setSelectedTime(time);
    // Keep the guest's area if it's still open at the new time, otherwise
    // fall back to no preference rather than silently booking a full area.
    if (area && !(areasByTime[time] ?? []).includes(area)) setArea("");
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
                  onClick={() => pickTime(s)}
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

      {noShowProtection && !selectedTime && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-neutral-700">
          <span className="font-semibold">A card is needed to hold your table.</span>{" "}
          {noShowProtection.minPartySize > 1 ? `For tables of ${noShowProtection.minPartySize} or more, you` : "You"} add it right here when you book — nothing is
          charged if you come. If the table is left empty, a no-show fee of{" "}
          {(noShowProtection.feeCents / 100).toLocaleString(undefined, { style: "currency", currency: "EUR" })} per person applies.
        </div>
      )}

      {selectedTime && venueHasAreas && !areasCustomised && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">Where would you like to sit?</p>
          <div className="flex flex-wrap gap-1.5">
            {["", ...openAreas].map((a) => {
              const isSelected = area === a;
              return (
                <button
                  key={a || "__any"}
                  type="button"
                  onClick={() => setArea(a)}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={
                    isSelected
                      ? { backgroundColor: brandColor, borderColor: brandColor, color: "#fff" }
                      : { borderColor: "#e5e5e5", color: "#404040" }
                  }
                >
                  {a || "No preference"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedTime && venueHasAreas && areasCustomised && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">Where would you like to sit?</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {[{ name: "", note: null as string | null }, ...areaChoices].map((a) => {
              const isAny = a.name === "";
              const isFull = !isAny && !openAreas.includes(a.name);
              const isSelected = area === a.name;
              return (
                <button
                  key={a.name || "__any"}
                  type="button"
                  disabled={isFull}
                  aria-disabled={isFull}
                  onClick={() => !isFull && setArea(a.name)}
                  className="rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed"
                  style={
                    isSelected
                      ? { backgroundColor: brandColor, borderColor: brandColor, color: "#fff" }
                      : isFull
                        ? { borderColor: "#eeeeee", color: "#a3a3a3", backgroundColor: "#fafafa" }
                        : { borderColor: "#e5e5e5", color: "#262626" }
                  }
                >
                  <span className="block text-xs font-semibold">{isAny ? "No preference" : a.name}</span>
                  {isFull ? (
                    <span className="block text-[11px]">Fully booked at {selectedTime} — try another area</span>
                  ) : a.note ? (
                    <span className="block text-[11px]" style={{ color: isSelected ? "rgba(255,255,255,0.85)" : "#737373" }}>{a.note}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {area && <p className="mt-1.5 text-[11px] text-neutral-500">Your table will be in {area} — we never move a booking to a different area.</p>}
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
          {requiresCard && noShowProtection && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <p className="mb-1 text-xs font-semibold text-neutral-800">Card to hold your table</p>
              <p className="mb-2 text-xs text-neutral-600">
                Nothing is charged now, and nothing at all if you come. If the table is left empty, a no-show fee of{" "}
                {(noShowProtection.feeCents / 100).toLocaleString(undefined, { style: "currency", currency: "EUR" })} per person
                {partySize > 1 && (
                  <>
                    {" "}({((noShowProtection.feeCents * partySize) / 100).toLocaleString(undefined, { style: "currency", currency: "EUR" })} for {partySize} guests)
                  </>
                )}{" "}
                is charged to this card. Need to cancel? Use the link in your confirmation email.
              </p>
              <NoShowCardField ref={cardFieldRef} setupIntentUrl={`/api/widget/${slug}/setup-intent`} />
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: brandColor }}
          >
            {submitting ? "Booking…" : `Confirm table for ${partySize} at ${selectedTime}${area ? ` · ${area}` : ""}`}
          </button>
        </form>
      )}

      {status && (
        <p className={`mt-3 text-sm ${status.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{status.message}</p>
      )}

      <p className="mt-4 text-center text-[10px] text-neutral-300">
        Powered by{" "}
        <a href="https://hostflow.space/hostflow" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-400">
          Host Flow
        </a>{" "}
        ·{" "}
        <a href="https://hostflow.space/hostflow/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-400">
          Privacy
        </a>
      </p>
    </div>
  );
}
