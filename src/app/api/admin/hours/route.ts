import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { isAdminRequest } from "@/lib/adminGuard";
import { timeStrSchema } from "@/types";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getActiveRestaurant();
  const hours = await prisma.openingHour.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { dayOfWeek: "asc" },
  });
  return NextResponse.json({ hours });
}

const putSchema = z.object({
  hours: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      openTime: timeStrSchema,
      closeTime: timeStrSchema,
      isClosed: z.boolean(),
    })
  ),
});

// Bulk upsert all 7 days at once — simplest UX for the settings page.
export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hours", details: parsed.error.flatten() }, { status: 400 });
  }

  const restaurant = await getActiveRestaurant();

  await Promise.all(
    parsed.data.hours.map((h) =>
      prisma.openingHour.upsert({
        where: { restaurantId_dayOfWeek: { restaurantId: restaurant.id, dayOfWeek: h.dayOfWeek } },
        create: { restaurantId: restaurant.id, ...h },
        update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
      })
    )
  );

  const hours = await prisma.openingHour.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { dayOfWeek: "asc" },
  });
  return NextResponse.json({ hours });
}
