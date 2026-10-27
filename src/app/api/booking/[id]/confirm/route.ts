import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitFloorChange } from "@/lib/hostflow/events";

// "Yes, we're coming" from the reminder email. Token-secured like the rest
// of /api/booking — no login, but nothing happens without the manage token.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = new URL(req.url).searchParams.get("t");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  const reservation = await prisma.reservation.findUnique({ where: { id: params.id } });
  if (!reservation || reservation.manageToken !== token) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json({ ok: false, status: reservation.status, error: "This booking can no longer be confirmed." }, { status: 409 });
  }
  if (!reservation.guestConfirmedAt) {
    await prisma.reservation.update({ where: { id: reservation.id }, data: { guestConfirmedAt: new Date() } });
    emitFloorChange(reservation.restaurantId, "reservation");
  }
  return NextResponse.json({ ok: true, confirmedAt: reservation.guestConfirmedAt ?? new Date() });
}
