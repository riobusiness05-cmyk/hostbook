import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { toLocalDateStr, toLocalTimeStr } from "@/lib/availability";
import { updateReservationSchema } from "@/types";
import { isAdminRequest } from "@/lib/adminGuard";
import { rescheduleReservationById } from "@/lib/reservationActions";

// PATCH /api/reservations/:id  (admin only — edit status, reschedule, etc.)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const restaurant = await getActiveRestaurant();
  const existing = await prisma.reservation.findUnique({ where: { id: params.id } });
  if (!existing || existing.restaurantId !== restaurant.id) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const { status, date, time, partySize, notes } = parsed.data;

  // Date, time, or party size all need the table re-verified — route them
  // through the same Serializable-transaction-protected, self-exclusion-aware
  // path the guest and AI-assistant reschedule flows use. This used to
  // reimplement the availability check inline with no transaction (a real
  // double-booking race), and silently skipped re-checking table capacity
  // entirely when only partySize changed.
  if (date || time || typeof partySize === "number") {
    const newDate = date ?? toLocalDateStr(existing.reservationTime, restaurant.timezone);
    const newTime = time ?? toLocalTimeStr(existing.reservationTime, restaurant.timezone);
    const result = await rescheduleReservationById(restaurant, params.id, newDate, newTime, partySize);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
  }

  if (status || typeof notes === "string") {
    await prisma.reservation.update({
      where: { id: params.id },
      data: {
        ...(status ? { status } : {}),
        ...(typeof notes === "string" ? { notes } : {}),
      },
    });
  }

  const updated = await prisma.reservation.findUnique({ where: { id: params.id }, include: { table: true } });
  return NextResponse.json({ reservation: updated });
}

// DELETE /api/reservations/:id  (admin only — hard cancel, keeps the row
// for record-keeping by setting status instead of actually deleting)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await getActiveRestaurant();
  const existing = await prisma.reservation.findUnique({ where: { id: params.id } });
  if (!existing || existing.restaurantId !== restaurant.id) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  await prisma.reservation.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
