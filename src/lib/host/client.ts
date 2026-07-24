// Thin typed client for the /api/host endpoints. Kept framework-free so any
// host component can call it. Every mutation resolves after the server has
// emitted its realtime change, so callers can also optimistically refetch.

import type { FloorState } from "@/lib/hostflow/floor";
import type { DayPlan } from "@/lib/hostflow/dayplan";
import type { TableAction } from "@/lib/hostflow/schemas";
import type { BillingState, PlanDTO } from "@/lib/billing/subscription";
import type { InvoiceSummary } from "@/lib/stripe";

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
};

export async function createReservation(
  input: NewReservationInput
): Promise<{ id: string; date: string; time: string; partySize: number; tableNumber: number }> {
  const res = await fetch("/api/host/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ reservation: { id: string; date: string; time: string; partySize: number; tableNumber: number } }>(res);
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

export async function askAssistant(message: string): Promise<{ reply: string; source: string; action?: string }> {
  const res = await fetch("/api/host/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return jsonOrThrow<{ reply: string; source: string; action?: string }>(res);
}

export type SeatingRec = {
  best: { tableId: string; tableNumber: number; name: string; reasons: string[] } | null;
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

export type BillingSummary = { billing: BillingState; invoices: InvoiceSummary[]; plans: PlanDTO[] };

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
