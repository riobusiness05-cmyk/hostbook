import { NextRequest, NextResponse } from "next/server";
import { getActiveRestaurant } from "@/lib/restaurant";
import { getAvailableSlots } from "@/lib/availability";
import { availabilityQuerySchema } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const parsed = availabilityQuerySchema.safeParse({
    date: searchParams.get("date"),
    partySize: searchParams.get("partySize"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const restaurant = await getActiveRestaurant();
  const slots = await getAvailableSlots({
    restaurant,
    dateStr: parsed.data.date,
    partySize: parsed.data.partySize,
  });

  return NextResponse.json({
    date: parsed.data.date,
    partySize: parsed.data.partySize,
    slots,
  });
}
