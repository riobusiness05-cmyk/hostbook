import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { combineDateAndTime } from "@/lib/availability";
import { createReservationForRestaurant } from "@/lib/reservationActions";
import { createReservationSchema } from "@/types";
import { isAdminRequest } from "@/lib/adminGuard";

// GET /api/reservations?date=YYYY-MM-DD  (admin only — lists bookings)
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await getActiveRestaurant();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // optional filter

  const where: Record<string, unknown> = { restaurantId: restaurant.id };
  if (date) {
    const dayStart = combineDateAndTime(date, "00:00");
    const dayEnd = combineDateAndTime(date, "23:59");
    where.reservationTime = { gte: dayStart, lte: dayEnd };
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: { table: true },
    orderBy: { reservationTime: "asc" },
  });

  return NextResponse.json({ reservations });
}

// POST /api/reservations  (public — used by the chat widget and the
// fallback booking form)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createReservationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reservation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const restaurant = await getActiveRestaurant();

  let result;
  try {
    result = await createReservationForRestaurant(restaurant, parsed.data);
  } catch (err) {
    console.error("[reservations] booking failed", err);
    return NextResponse.json(
      { error: "We couldn't complete that booking — please try again in a moment." },
      { status: 500 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // Hook point: send confirmation email/SMS here (Twilio/Resend) —
  // see README "Notifications" section for wiring instructions.

  return NextResponse.json({ reservation: result.data }, { status: 201 });
}
