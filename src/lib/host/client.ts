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

export type ThankYouCandidate = { visitId: string; customerName: string; customerEmail: string | null };
export type ReleaseThankYou = { ask: ThankYouCandidate | null; scheduledFor: string | null; sentNow: boolean };

export type TableActionResult = {
  ok: true;
  // Set by "release": who just left and what the venue's thank-you setting
  // did about it — ask staff (`ask`), queued (`scheduledFor`) or sent (`sentNow`).
  thankYou?: ReleaseThankYou | null;
};

export async function tableAction(tableId: string, action: TableAction): Promise<TableActionResult> {
  const res = await fetch(`/api/host/tables/${tableId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  return jsonOrThrow<TableActionResult>(res);
}

export type ThankYouOutcome = { sent: true; to: string } | { sent: false; reason: string; message: string };

/** Sends the thank-you for a visit; `email` adds an address when the visit has none. */
export async function sendVisitThankYou(visitId: string, email?: string): Promise<ThankYouOutcome> {
  const res = await fetch(`/api/host/visits/${visitId}/thank-you`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email ? { email } : {}),
  });
  // 409 carries a plain reason ("already sent", "no email") — not an error to throw on.
  if (res.status === 409) return (await res.json()) as ThankYouOutcome;
  return jsonOrThrow<ThankYouOutcome>(res);
}

export function visitThankYouPreviewUrl(visitId: string, email?: string): string {
  return `/api/host/visits/${visitId}/thank-you${email ? `?email=${encodeURIComponent(email)}` : ""}`;
}

// ── Brand kit ───────────────────────────────────────────────────────────

export type BrandAsset = { id: string; kind: "LOGO" | "PHOTO"; url: string; width: number | null; height: number | null; bytes: number; alt: string | null; sortOrder: number };
export type Palette = { primary: string | null; secondary: string | null; swatches: string[] };

export async function fetchBrandAssets(): Promise<BrandAsset[]> {
  const res = await fetch("/api/host/brand/assets", { cache: "no-store" });
  return (await jsonOrThrow<{ assets: BrandAsset[] }>(res)).assets;
}

export async function uploadBrandAsset(kind: "LOGO" | "PHOTO", file: File): Promise<{ asset: BrandAsset; palette: Palette }> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file);
  const res = await fetch("/api/host/brand/assets", { method: "POST", body: form });
  return jsonOrThrow<{ asset: BrandAsset; palette: Palette }>(res);
}

export async function updateBrandAsset(id: string, patch: { alt?: string | null; sortOrder?: number }): Promise<void> {
  const res = await fetch(`/api/host/brand/assets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  await jsonOrThrow(res);
}

export async function deleteBrandAsset(id: string): Promise<void> {
  const res = await fetch(`/api/host/brand/assets/${id}`, { method: "DELETE" });
  await jsonOrThrow(res);
}

/** Renders the first sample with UNSAVED settings — the live preview while editing. */
export async function previewThankYou(draft: Partial<SettingsDTO>): Promise<string> {
  const res = await fetch("/api/host/brand/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
  if (!res.ok) throw new Error("preview failed");
  return res.text();
}

export type ThankYouSample = { label: string; subject: string; html: string };
export async function fetchThankYouSamples(): Promise<ThankYouSample[]> {
  const res = await fetch("/api/host/brand/samples", { cache: "no-store" });
  return (await jsonOrThrow<{ samples: ThankYouSample[] }>(res)).samples;
}

export type EmailStats = { sent: number; opened: number; clicked: number; bounced: number; openRate: number };
export async function fetchEmailStats(): Promise<EmailStats> {
  const res = await fetch("/api/host/emails/stats", { cache: "no-store" });
  return jsonOrThrow<EmailStats>(res);
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

export type ReservationSlots = { slots: string[]; areasByTime: Record<string, string[]> };

export async function fetchReservationSlots(date: string, partySize: number): Promise<ReservationSlots> {
  const res = await fetch(`/api/host/reservations/slots?date=${date}&partySize=${partySize}`);
  return jsonOrThrow<ReservationSlots>(res);
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

export type NoShowChargeOutcome = { outcome: "charged" | "failed" | "waived"; reason?: string } | null;

export async function setReservationStatus(
  id: string,
  status: string,
  opts: { chargeNoShowFee?: boolean } = {}
): Promise<{ noShowCharge: NoShowChargeOutcome }> {
  const res = await fetch(`/api/host/reservations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...opts }),
  });
  return jsonOrThrow<{ ok: true; noShowCharge: NoShowChargeOutcome }>(res);
}

export async function addReservationComment(id: string, body: string) {
  const res = await fetch(`/api/host/reservations/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return jsonOrThrow<{ ok: true; comment: { id: string; authorName: string; body: string; createdAt: string } }>(res);
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

/** Moves a paying venue onto another plan (prorated by Stripe). */
export async function changePlan(planKey: string): Promise<BillingState> {
  const res = await fetch("/api/host/billing/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey }),
  });
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

export type RestaurantRow = {
  name: string;
  timezone: string;
  onboardingCompletedAt: string | null;
  brandColor: string;
  logoUrl: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
  // The address guest emails are sent from — fixed per venue, shown in
  // Settings → Emails so hosts know what their guests will see.
  senderAddress: string;
};

export async function fetchRestaurant(): Promise<RestaurantRow> {
  const res = await fetch("/api/host/restaurant", { cache: "no-store" });
  const data = await jsonOrThrow<{ restaurant: RestaurantRow }>(res);
  return data.restaurant;
}

export async function updateRestaurant(patch: {
  timezone?: string;
  onboardingCompletedAt?: true;
  brandColor?: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
}): Promise<void> {
  const res = await fetch("/api/host/restaurant", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  await jsonOrThrow(res);
}

export type PaymentsConnectStatus = { connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };

export async function getPaymentsStatus(): Promise<PaymentsConnectStatus> {
  const res = await fetch("/api/host/payments/status", { cache: "no-store" });
  return jsonOrThrow<PaymentsConnectStatus>(res);
}

export async function startStripeConnect(): Promise<{ url: string }> {
  const res = await fetch("/api/host/payments/connect", { method: "POST" });
  return jsonOrThrow<{ url: string }>(res);
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

// ── Guest emails ────────────────────────────────────────────────────────

/** Sends the saved thank-you email to `to` (default: the signed-in account's own inbox). */
export async function sendThankYouTestEmail(to?: string): Promise<{ to: string }> {
  const res = await fetch("/api/host/settings/thank-you-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(to ? { to } : {}),
  });
  return jsonOrThrow<{ ok: true; to: string }>(res);
}

export type EmailLogRow = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  status: "SENT" | "FAILED" | "SKIPPED" | string;
  error: string | null;
  providerId: string | null;
  createdAt: string;
};

export async function fetchEmailLog(): Promise<EmailLogRow[]> {
  const res = await fetch("/api/host/settings/email-log", { cache: "no-store" });
  const data = await jsonOrThrow<{ emails: EmailLogRow[] }>(res);
  return data.emails;
}
