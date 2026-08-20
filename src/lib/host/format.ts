// Small presentational helpers shared across host components.
//
// Every function here that takes a `timeZone` formats against that IANA
// zone (e.g. "Atlantic/Canary" — see FloorState.timezone) rather than the
// browser's own timezone. Without it, a host viewing the dashboard from a
// device set to a different zone than the restaurant would see bookings
// grouped into the wrong day and displayed at the wrong time even though
// the underlying data is correct — the same bug already fixed server-side
// (see src/lib/availability.ts) resurfacing on the client. `timeZone` is
// optional only so a call site mid-migration still compiles; every real
// call site should pass state.timezone.

export function timeOfDay(iso: string, timeZone?: string): string {
  // Locale pinned (not `undefined`/`[]`) so this renders identically on the
  // server and in the browser — an unpinned locale resolves to each
  // runtime's own default and can format the same instant as "10:01 PM" on
  // the server vs "22:01" on the client, a hydration mismatch. See
  // BillingSection.tsx / AdminDashboard.tsx for the same fix.
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

// "YYYY-MM-DD" in `timeZone`, mirroring toLocalDateStr in availability.ts —
// duplicated rather than imported because that module pulls in the Prisma
// client, which must never end up in a browser bundle.
export function localDateStr(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

// Minutes since local midnight in `timeZone`, mirroring minutesOfDayInTz in
// availability.ts.
export function minutesOfDayInTz(iso: string, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(
    new Date(iso)
  );
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function minutesLabel(mins: number): string {
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function relativeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  return `${minutesLabel(mins)} ago`;
}

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(n);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
