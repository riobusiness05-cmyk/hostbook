import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { settingsSchema } from "@/lib/hostflow/schemas";
import { getSettings } from "@/lib/hostflow/floor";
import { emitFloorChange } from "@/lib/hostflow/events";
import { hasPremiumFeatures } from "@/lib/billing/subscription";

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const settings = await getSettings(ctx.restaurantId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.thankYouEmailEnabled && !(await hasPremiumFeatures(ctx.restaurantId))) {
    return NextResponse.json({ error: "Guest thank-you emails are part of the Premium plan. Upgrade in Settings → Billing to switch them on." }, { status: 403 });
  }
  await prisma.restaurantSettings.upsert({
    where: { restaurantId: ctx.restaurantId },
    create: { restaurantId: ctx.restaurantId, ...parsed.data },
    update: parsed.data,
  });
  emitFloorChange(ctx.restaurantId, "settings");
  const settings = await getSettings(ctx.restaurantId);
  return NextResponse.json({ settings });
}
