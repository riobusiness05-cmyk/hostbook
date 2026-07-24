import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { combineDateAndTime, findAvailableTable, toLocalDateStr, toLocalTimeStr } from "@/lib/availability";
import { updateReservationSchema } from "@/types";
import { isAdminRequest } from "@/lib/adminGuard";

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
  const data: Record<string, unknown> = {};

  if (status) data.status = status;
  if (typeof partySize === "number") data.partySize = partySize;
  if (typeof notes === "string") data.notes = notes;

  // If date/time changed, re-check availability and reassign a table.
  if (date || time) {
    const currentDateStr = toLocalDateStr(existing.reservationTime);
    const currentTimeStr = toLocalTimeStr(existing.reservationTime);
    const newDate = date ?? currentDateStr;
    const newTime = time ?? currentTimeStr;
    const newPartySize = partySize ?? existing.partySize;

    const table = await findAvailableTable({
      restaurant,
      dateStr: newDate,
      time: newTime,
      partySize: newPartySize,
    });

    if (!table) {
      return NextResponse.json(
        { error: "No table available for the requested new date/time/party size." },
        { status: 409 }
      );
    }

    data.reservationTime = combineDateAndTime(newDate, newTime);
    data.tableId = table.id;
  }

  const updated = await prisma.reservation.update({
    where: { id: params.id },
    data,
    include: { table: true },
  });

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
