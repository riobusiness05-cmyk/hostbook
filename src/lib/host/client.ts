// Thin typed client for the /api/host endpoints. Kept framework-free so any
// host component can call it. Every mutation resolves after the server has
// emitted its realtime change, so callers can also optimistically refetch.

import type { FloorState, SettingsDTO } from "@/lib/hostflow/floor";
import type { DayPlan } from "@/lib/hostflow/dayplan";
import type { TableAction } from "@/lib/hostflow/schemas";
import type { BillingState, PlanDTO } from "@/lib/billing/subscription";
import type { InvoiceSummary, PaymentMethodSummary } from "@/lib/stripe";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchFloor(signal?: AbortSignal): Promise<FloorState> {
  const res = await fetch("/api/host/floor", { signal, cache: "no-store" });
  return jsonOrThrow<FloorState>(res);
}

export async function fetchDayPlan(date: string, signal?: AbortSignal): Promise<DayPlan> {
  const res = await fetch(`/api/host/day?date=${date}`, { signal, cache: "no-store" });
  return jsonOrThrow<DayPlan>(res);
}

export async function tableAction(tableId: string, action: TableAction): Promise<void> {
  const res = await fetch(`/api/host/tables/${tableId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  await jsonOrThrow(res);
}

export async function addWalkin(input: {
  name: string;
  phone?: string;
  partySize: number;
  priority?: string;
  quotedWaitMinutes?: number;
  notes?: string;
  accessibilityNeeds?: string;
}): Promise<void> {
  const res = await fetch("/api/host/walkins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await jsonOrThrow(res);
}

export async function updateWalkin(
  id: string,
  input: { status?: string; priority?: string; quotedWaitMinutes?: number; notes?: string }
): Promise<void> {
  const res = await fetch(`/api/host/walkins/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await jsonOrThrow(res);
}

export async function seatWalkin(id: string, tableId?: string): Promise<{ tableId: string }> {
  const res = await fetch(`/api/host/walkins/${id}/seat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId }),
  });
  return jsonOrThrow<{ tableId: string }>(res);
}

export async function fetchReservationSlots(date: string, partySize: number): Promise<string[]> {
  const res = await fetch(`/api/host/reservations/slots?date=${date}&partySize=${partySize}`);
  const data = await jsonOrThrow<{ slots: string[] }>(res);
  return data.slots;
}

export type NewReservationInput = {
  date: string;
  time: string;
  partySize: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  occasion?: string;
  seatingPreference?: string;
  accessibilityNeeds?: string;
  highChair?: boolean;
  notes?: string;
  idempotencyKey?: string;
};

export type CreatedReservation = {
  id: string;
  date: string;
  time: string;
  partySize: number;
  tableNumber: number;
  // Extra table numbers when the party needed more than one table combined.
  comboTableNumbers: number[];
};

export async function createReservation(input: NewReservationInput): Promise<CreatedReservation> {
  const res = await fetch("/api/host/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ reservation: CreatedReservation }>(res);
  return data.reservation;
}

export async function setReservationStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`/api/host/reservations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  await jsonOrThrow(res);
}

export async function markNotifications(id?: string): Promise<void> {
  const res = await fetch("/api/host/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { id } : {}),
  });
  await jsonOrThrow(res);
}

export async function askAssistant(
  message: string,
  history?: { role: "user" | "assistant"; text: string }[]
): Promise<{ reply: string; source: string; action?: string }> {
  const res = await fetch("/api/host/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  return jsonOrThrow<{ reply: string; source: string; action?: string }>(res);
}

export type SeatingRec = {
  best: { tableId: string; tableNumber: number; name: string; reasons: string[] } | null;
  combo: { tableIds: string[]; tableNumbers: number[]; totalSeats: number; sectionName: string | null } | null;
  estimatedWaitMinutes: number;
  message: string;
};

export async function recommendSeating(partySize: number, sectionId?: string): Promise<SeatingRec> {
  const res = await fetch("/api/host/seating", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partySize, sectionId }),
  });
  const data = await jsonOrThrow<{ recommendation: SeatingRec }>(res);
  return data.recommendation;
}

// ── Billing ─────────────────────────────────────────────────────────────

export type BillingSummary = {
  billing: BillingState;
  invoices: InvoiceSummary[];
  paymentMethod: PaymentMethodSummary | null;
  plans: PlanDTO[];
};

export async function fetchBillingSummary(signal?: AbortSignal): Promise<BillingSummary> {
  const res = await fetch("/api/host/billing", { signal, cache: "no-store" });
  return jsonOrThrow<BillingSummary>(res);
}

export async function createCheckoutSession(planKey: string, interval: "MONTH" | "YEAR" = "MONTH"): Promise<string> {
  const res = await fetch("/api/host/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey, interval }),
  });
  const data = await jsonOrThrow<{ url: string }>(res);
  return data.url;
}

export async function openBillingPortal(): Promise<string> {
  const res = await fetch("/api/host/billing/portal", { method: "POST" });
  const data = await jsonOrThrow<{ url: string }>(res);
  return data.url;
}

export async function cancelSubscription(): Promise<BillingState> {
  const res = await fetch("/api/host/billing/cancel", { method: "POST" });
  const data = await jsonOrThrow<{ billing: BillingState }>(res);
  return data.billing;
}

export async function resumeSubscription(): Promise<BillingState> {
  const res = await fetch("/api/host/billing/resume", { method: "POST" });
  const data = await jsonOrThrow<{ billing: BillingState }>(res);
  return data.billing;
}

export async function fetchSettings(): Promise<SettingsDTO> {
  const res = await fetch("/api/host/settings", { cache: "no-store" });
  const data = await jsonOrThrow<{ settings: SettingsDTO }>(res);
  return data.settings;
}

export async function updateSettings(patch: Partial<SettingsDTO>): Promise<SettingsDTO> {
  const res = await fetch("/api/host/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await jsonOrThrow<{ settings: SettingsDTO }>(res);
  return data.settings;
}

export type HourRow = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

export async function fetchHours(): Promise<HourRow[]> {
  const res = await fetch("/api/host/hours", { cache: "no-store" });
  const data = await jsonOrThrow<{ hours: HourRow[] }>(res);
  return data.hours;
}

export async function updateHours(hours: HourRow[]): Promise<HourRow[]> {
  const res = await fetch("/api/host/hours", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hours }),
  });
  const data = await jsonOrThrow<{ hours: HourRow[] }>(res);
  return data.hours;
}

export type TableRow = {
  id: string;
  tableNumber: number;
  name: string;
  capacityMin: number;
  capacityMax: number;
  isActive: boolean;
  sectionName: string | null;
};

export async function fetchAllTables(): Promise<TableRow[]> {
  const res = await fetch("/api/host/tables", { cache: "no-store" });
  const data = await jsonOrThrow<{ tables: TableRow[] }>(res);
  return data.tables;
}

export type RestaurantRow = { name: string; timezone: string; onboardingCompletedAt: string | null };

export async function fetchRestaurant(): Promise<RestaurantRow> {
  const res = await fetch("/api/host/restaurant", { cache: "no-store" });
  const data = await jsonOrThrow<{ restaurant: RestaurantRow }>(res);
  return data.restaurant;
}

export async function updateRestaurant(patch: { timezone?: string; onboardingCompletedAt?: true }): Promise<void> {
  const res = await fetch("/api/host/restaurant", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  await jsonOrThrow(res);
}

export type DetectedTable = {
  tempId: string;
  number: number | null;
  shape: "ROUND" | "SQUARE" | "RECT";
  seats: number;
  x: number;
  y: number;
  rotation: number;
  mergedWithTempId: string | null;
  sectionTempId: string;
  confidence: number;
};
export type DetectedSection = { tempId: string; name: string; isOutdoor: boolean };
export type FloorPlanAnalysis = {
  sections: DetectedSection[];
  tables: DetectedTable[];
  overallConfidence: number;
  lowConfidenceCount: number;
  notes: string[];
};

export async function analyzeFloorPlanImage(imageBase64: string, mediaType: string): Promise<FloorPlanAnalysis> {
  const res = await fetch("/api/host/floor-plan/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mediaType }),
  });
  const data = await jsonOrThrow<{ analysis: FloorPlanAnalysis }>(res);
  return data.analysis;
}

export async function resetFloorPlan(): Promise<{ count: number }> {
  const res = await fetch("/api/host/floor-plan/reset", { method: "POST" });
  return jsonOrThrow<{ count: number }>(res);
}

export async function applyFloorPlan(payload: {
  room: string;
  sections: DetectedSection[];
  tables: DetectedTable[];
}): Promise<{ tableCount: number; sectionCount: number }> {
  const res = await fetch("/api/host/floor-plan/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}
