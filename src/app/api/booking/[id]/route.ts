import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { toLocalDateStr, toLocalTimeStr } from "@/lib/availability";
import { dateStrSchema, timeStrSchema } from "@/types";
import { updateReservationStatus } from "@/lib/hostflow/actions";
import { rescheduleReservationById } from "@/lib/reservationActions";

// Public, token-secured booking management. A guest reaches this via the
// unguessable `manageToken` printed on their confirmation link — no login.
// Every handler requires the token to match the reservation, so knowing an
// id alone is never enough to view or change a booking.

async function loadOwned(id: string, token: string | null) {
  if (!token) return { error: NextResponse.json({ error: "Missing token" }, { status: 401 }) };
  const restaurant = await getActiveRestaurant();
  const reservation = await prisma.reservation.findUnique({ where: { id }, include: { table: true } });
  if (!reservation || reservation.restaurantId !== restaurant.id || reservation.manageToken !== token) {
    return { error: NextResponse.json({ error: "Booking not found" }, { status: 404 }) };
  }
  return { restaurant, reservation };
}

function publicView(r: Awaited<ReturnType<typeof loadOwned>>["reservation"]) {
  if (!r) return null;
  return {
    id: r.id,
    customerName: r.customerName,
    partySize: r.partySize,
    date: toLocalDateStr(r.reservationTime),
    time: toLocalTimeStr(r.reservationTime),
    status: r.status,
    tableNumber: r.table?.tableNumber ?? null,
    occasion: r.occasion,
    seatingPreference: r.seatingPreference,
    accessibilityNeeds: r.accessibilityNeeds,
    notes: r.notes,
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = new URL(req.url).searchParams.get("t");
  const res = await loadOwned(params.id, token);
  if ("error" in res) return res.error;
  return NextResponse.json({ reservation: publicView(res.reservation) });
}

const patchSchema = z.object({
  token: z.string().min(1),
  date: dateStrSchema.optional(),
  time: timeStrSchema.optional(),
  partySize: z.number().int().min(1).max(30).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const res = await loadOwned(params.id, parsed.data.token);
  if ("error" in res) return res.error;
  const { restaurant, reservation } = res;

  const newDate = parsed.data.date ?? toLocalDateStr(reservation.reservationTime);
  const newTime = parsed.data.time ?? toLocalTimeStr(reservation.reservationTime);

  // Delegates to the same Serializable-transaction-protected, self-exclusion-
  // aware reschedule path the AI assistant uses — this route used to
  // reimplement the availability check inline with no transaction, which
  // meant two concurrent reschedules (or a reschedule racing a new booking)
  // could both succeed and double-book the table.
  const result = await rescheduleReservationById(restaurant, reservation.id, newDate, newTime, parsed.data.partySize);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id }, include: { table: true } });
  return NextResponse.json({ reservation: publicView(updated) });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const token = new URL(req.url).searchParams.get("t");
  const res = await loadOwned(params.id, token);
  if ("error" in res) return res.error;

  if (res.reservation.status === "CANCELLED") {
    return NextResponse.json({ ok: true });
  }
  // Reuse the host action so a guest cancellation also frees any held table
  // on the live floor plan and emits a realtime update.
  await updateReservationStatus(res.restaurant.id, res.reservation.id, "CANCELLED");
  return NextResponse.json({ ok: true });
}
