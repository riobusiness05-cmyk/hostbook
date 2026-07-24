// Small presentational helpers shared across host components.

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
