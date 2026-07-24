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
  /** Tailwind text/bg utility classes for chips in the UI. */
  chip: string;
};

// Colour system per the brief. Kept as hex so the SVG floor plan and the
// legend share one source of truth; Tailwind chip classes are for HTML chips.
export const STATUS_META: Record<TableStatus, StatusMeta> = {
  AVAILABLE: { label: "Available", color: "#22c55e", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  OCCUPIED: { label: "Occupied", color: "#ef4444", chip: "bg-red-500/15 text-red-600 dark:text-red-400" },
  RESERVED: { label: "Reserved", color: "#3b82f6", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  ARRIVING_SOON: { label: "Arriving soon", color: "#f97316", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  LATE: { label: "Late", color: "#a855f7", chip: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  DIRTY: { label: "Dirty", color: "#9ca3af", chip: "bg-gray-400/20 text-gray-600 dark:text-gray-300" },
  CLEANING: { label: "Cleaning", color: "#eab308", chip: "bg-yellow-400/20 text-yellow-700 dark:text-yellow-400" },
  BLOCKED: { label: "Blocked", color: "#1f2937", chip: "bg-gray-800/20 text-gray-800 dark:text-gray-200" },
};

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
