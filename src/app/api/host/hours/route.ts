import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { timeStrSchema } from "@/types";

// Host Flow's own opening-hours editor — mirrors /api/admin/hours (the
// legacy single-tenant template's version) but gated on the multi-tenant
// host session instead of the env-based admin login.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const hours = await prisma.openingHour.findMany({
    where: { restaurantId: ctx.restaurantId },
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
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hours", details: parsed.error.flatten() }, { status: 400 });
  }

  await Promise.all(
    parsed.data.hours.map((h) =>
      prisma.openingHour.upsert({
        where: { restaurantId_dayOfWeek: { restaurantId: ctx.restaurantId, dayOfWeek: h.dayOfWeek } },
        create: { restaurantId: ctx.restaurantId, ...h },
        update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
      })
    )
  );

  const hours = await prisma.openingHour.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { dayOfWeek: "asc" },
  });
  return NextResponse.json({ hours });
}
