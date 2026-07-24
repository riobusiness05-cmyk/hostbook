import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { createReservationSchema } from "@/types";
import { createReservationForRestaurant } from "@/lib/reservationActions";
import { emitFloorChange } from "@/lib/hostflow/events";

// Host-created reservation (e.g. a phone booking for a future date), scoped to
// the logged-in venue. Reuses the same availability + table-assignment engine
// as the public booking form, then emits a realtime update so the Bookings
// tab refreshes instantly.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => null);
  const parsed = createReservationSchema.safeParse({ ...body, source: "ADMIN" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reservation", details: parsed.error.flatten() }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: ctx.restaurantId } });
  if (!restaurant) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

  try {
    const result = await createReservationForRestaurant(restaurant, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    emitFloorChange(ctx.restaurantId, "reservation");
    return NextResponse.json({ reservation: result.data }, { status: 201 });
  } catch (err) {
    return handleActionError(err);
  }
}
