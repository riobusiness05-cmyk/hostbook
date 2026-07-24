import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { isAdminRequest } from "@/lib/adminGuard";
import { dateStrSchema, timeStrSchema } from "@/types";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getActiveRestaurant();
  const blackouts = await prisma.blackoutDate.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ blackouts });
}

const createSchema = z.object({
  date: dateStrSchema,
  fullDay: z.boolean().default(true),
  startTime: timeStrSchema.optional(),
  endTime: timeStrSchema.optional(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid blackout date", details: parsed.error.flatten() }, { status: 400 });
  }
  const restaurant = await getActiveRestaurant();
  const [y, m, d] = parsed.data.date.split("-").map(Number);
  const blackout = await prisma.blackoutDate.create({
    data: {
      restaurantId: restaurant.id,
      date: new Date(y, m - 1, d),
      fullDay: parsed.data.fullDay,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      reason: parsed.data.reason,
    },
  });
  return NextResponse.json({ blackout }, { status: 201 });
}
