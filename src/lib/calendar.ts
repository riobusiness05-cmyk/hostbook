// Calendar link helpers for booking confirmations. Pure string builders so
// they run on the server (to pass ready-made links to the client) or client.

function stamp(d: Date): string {
  // UTC basic format: YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export type CalEvent = {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
};

export function googleCalUrl(e: CalEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    details: e.details ?? "",
    location: e.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function icsContent(e: CalEvent): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Colonial//Host Flow//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(e.start)}-${Math.random().toString(36).slice(2)}@thecolonial`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.details ? `DESCRIPTION:${esc(e.details)}` : "",
    e.location ? `LOCATION:${esc(e.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function icsDataUrl(e: CalEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent(e))}`;
}
