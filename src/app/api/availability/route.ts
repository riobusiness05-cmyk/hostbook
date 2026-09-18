import { NextRequest, NextResponse } from "next/server";
import { getActiveRestaurant } from "@/lib/restaurant";
import { getSlotAvailability } from "@/lib/availability";
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
  const detailed = await getSlotAvailability({
    restaurant,
    dateStr: parsed.data.date,
    partySize: parsed.data.partySize,
  });

  return NextResponse.json({
    date: parsed.data.date,
    partySize: parsed.data.partySize,
    slots: detailed.map((s) => s.time),
    // Which named areas still have room at each time — drives the guest's
    // "where would you like to sit?" choice.
    areasByTime: Object.fromEntries(detailed.map((s) => [s.time, s.areas])),
  });
}
