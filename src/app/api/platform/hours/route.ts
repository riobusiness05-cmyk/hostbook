import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { emitFloorChange } from "@/lib/hostflow/events";

// Opening hours for a venue, set by the platform operator during onboarding.
// Same shape and rules as the venue's own Settings → Hours. The last
// bookable slot is closeTime minus the venue's default sitting length.
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  restaurantId: z.string().min(1),
  hours: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: hm, closeTime: hm, isClosed: z.boolean() })).length(7),
});

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  const [hours, restaurant] = await Promise.all([
    prisma.openingHour.findMany({ where: { restaurantId }, orderBy: { dayOfWeek: "asc" } }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { defaultReservationMinutes: true } }),
  ]);
  return NextResponse.json({ hours, sittingMinutes: restaurant?.defaultReservationMinutes ?? null });
}

export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid hours" }, { status: 400 });
  const { restaurantId, hours } = parsed.data;
  await Promise.all(
    hours.map((h) =>
      prisma.openingHour.upsert({
        where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: h.dayOfWeek } },
        create: { restaurantId, ...h },
        update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
      })
    )
  );
  emitFloorChange(restaurantId, "settings");
  return NextResponse.json({ hours: await prisma.openingHour.findMany({ where: { restaurantId }, orderBy: { dayOfWeek: "asc" } }) });
}
