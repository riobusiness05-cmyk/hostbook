import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { getAvailableSlots } from "@/lib/availability";
import { availabilityQuerySchema } from "@/types";

// Available time slots for a future date, scoped to the logged-in venue.
// Powers the host "New reservation" form's time picker.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const { searchParams } = new URL(req.url);
  const parsed = availabilityQuerySchema.safeParse({
    date: searchParams.get("date"),
    partySize: searchParams.get("partySize"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date or party size" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: ctx.restaurantId } });
  if (!restaurant) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

  const slots = await getAvailableSlots({
    restaurant,
    dateStr: parsed.data.date,
    partySize: parsed.data.partySize,
  });
  return NextResponse.json({ slots });
}
