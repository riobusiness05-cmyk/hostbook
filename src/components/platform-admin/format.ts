// Shared between AdminDashboard.tsx and RestaurantDetail.tsx.

export const STATUS_META: Record<string, { label: string; color: string }> = {
  COMPLIMENTARY: { label: "Complimentary", color: "#a855f7" },
  TRIAL: { label: "Trial", color: "#3b82f6" },
  ACTIVE: { label: "Active", color: "#22c55e" },
  PAST_DUE: { label: "Past due", color: "#f97316" },
  CANCELLED: { label: "Cancelled", color: "#6b7280" },
  EXPIRED: { label: "Expired", color: "#ef4444" },
};

// Locale pinned (not `undefined`) so server-rendered and client-hydrated
// output always match — the runtime's default locale can differ between
// Node (SSR) and the browser (hydration), which otherwise triggers a
// hydration mismatch on this exact string.
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}
