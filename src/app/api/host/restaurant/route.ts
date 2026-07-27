import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";

// Restaurant-level fields (as opposed to RestaurantSettings, which is the
// operational-policy table) — currently just `timezone`, which every date/
// time calculation in the app is keyed off (see src/lib/availability.ts).
// Never exposed anywhere before this; onboarding and General settings both
// need to be able to set it.

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: ctx.restaurantId },
    select: { name: true, timezone: true, onboardingCompletedAt: true },
  });
  return NextResponse.json({ restaurant });
}

const patchSchema = z.object({
  timezone: z
    .string()
    .min(1)
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Not a recognized timezone")
    .optional(),
  onboardingCompletedAt: z.literal(true).optional(), // marks the wizard done — never unset it via this route
});

export async function PATCH(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  await prisma.restaurant.update({
    where: { id: ctx.restaurantId },
    data: {
      ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
      ...(parsed.data.onboardingCompletedAt ? { onboardingCompletedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
