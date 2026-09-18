// Shared, framework-agnostic Host Flow constants. Safe to import from both
// server code and client components (no Node/Prisma imports here).

export const TABLE_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "ARRIVING_SOON",
  "LATE",
  "DIRTY",
  "CLEANING",
  "BLOCKED",
] as const;

export type TableStatus = (typeof TABLE_STATUSES)[number];

type StatusMeta = {
  label: string;
  /** Base hex used for the SVG fill and legend swatch. */
  color: string;
  /** Lighter tone for the lit top edge of a table on the floor plan. */
  glow: string;
  /** Text colour that stays legible on `color`. */
  ink: string;
  /** Tailwind text/bg utility classes for chips in the UI. */
  chip: string;
};

// A floor seen from above at night, not a status board. Two ideas drive this:
//
// 1. Everything is warm-biased to sit on the product's charcoal ground
//    (hf-bg) rather than the stock full-saturation Tailwind hues, which all
//    shouted at equal volume and made the room read like a bug tracker.
// 2. Weight follows what a host is actually hunting for. A free table is the
//    thing they scan for mid-service, so AVAILABLE is the clean, cool light
//    that pops. An occupied table is context, not a task, so it settles into
//    a warm amber that recedes. Red is reserved for the one genuine alarm —
//    a late booking — instead of being spent on "occupied", which is just
//    a restaurant working normally.
export const STATUS_META: Record<TableStatus, StatusMeta> = {
  AVAILABLE: { label: "Available", color: "#2f7d5c", glow: "#6ddaa6", ink: "#eafff4", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  OCCUPIED: { label: "Occupied", color: "#8f4a24", glow: "#e08a4a", ink: "#fdf1e6", chip: "bg-amber-600/15 text-amber-700 dark:text-amber-400" },
  RESERVED: { label: "Reserved", color: "#3c5c85", glow: "#7ba7d9", ink: "#eaf2ff", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  ARRIVING_SOON: { label: "Arriving soon", color: "#a67a27", glow: "#e8bb60", ink: "#fff7e6", chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  LATE: { label: "Late", color: "#a83733", glow: "#f0736a", ink: "#ffeceb", chip: "bg-red-500/15 text-red-600 dark:text-red-400" },
  DIRTY: { label: "Dirty", color: "#575049", glow: "#8f8578", ink: "#f0ebe4", chip: "bg-stone-400/20 text-stone-600 dark:text-stone-300" },
  CLEANING: { label: "Cleaning", color: "#5f6b3c", glow: "#a8b874", ink: "#f4f8e8", chip: "bg-lime-600/15 text-lime-700 dark:text-lime-400" },
  BLOCKED: { label: "Blocked", color: "#26221d", glow: "#3d372f", ink: "#9a9086", chip: "bg-stone-800/25 text-stone-700 dark:text-stone-300" },
};

/** The lit tone for a status — the top edge of the table on the floor plan. */
export function statusGlow(status: string): string {
  return STATUS_META[status as TableStatus]?.glow ?? "#8f8578";
}

/** Legible text colour for a table filled with `statusColor(status)`. */
export function statusInk(status: string): string {
  return STATUS_META[status as TableStatus]?.ink ?? "#f3efe6";
}

export function statusColor(status: string): string {
  return STATUS_META[status as TableStatus]?.color ?? "#64748b";
}

export function statusLabel(status: string): string {
  return STATUS_META[status as TableStatus]?.label ?? status;
}

export const WALKIN_PRIORITIES = ["NORMAL", "HIGH", "VIP"] as const;
export type WalkinPriority = (typeof WALKIN_PRIORITIES)[number];

export const PRIORITY_WEIGHT: Record<WalkinPriority, number> = {
  VIP: 3,
  HIGH: 2,
  NORMAL: 1,
};

export const NOTIFICATION_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

// Statuses that mean a table cannot currently seat a new party.
export const OCCUPIED_STATUSES: TableStatus[] = ["OCCUPIED", "RESERVED", "ARRIVING_SOON", "LATE"];
export const UNAVAILABLE_STATUSES: TableStatus[] = [...OCCUPIED_STATUSES, "DIRTY", "CLEANING", "BLOCKED"];

// Built-in wording for the post-visit thank-you email, used when a
// restaurant hasn't written its own (see guestEmails.ts). {name} and
// {restaurant} are filled in at send time.
export const DEFAULT_THANK_YOU_SUBJECT = "Thanks for visiting {restaurant}";
export const DEFAULT_THANK_YOU_BODY =
  "Hi {name},\n\nThank you for dining with us at {restaurant} — we hope you had a lovely time.\n\nIf you have a minute, we'd really appreciate a quick Google review. It genuinely helps a small team like ours, and we read every single one.\n\nSee you again soon!";
