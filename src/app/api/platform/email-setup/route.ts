import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/hostflow/floor";
import { webUrl } from "@/lib/hostflow/schemas";
import { hasPremiumFeatures } from "@/lib/billing/subscription";
import { normalizeReviewLink } from "@/lib/brandKit";
import { emitFloorChange } from "@/lib/hostflow/events";

// The handful of thank-you settings a venue would otherwise set in its own
// Brand kit — exposed to the platform operator so a venue can be set up
// for them end to end (design + review link + mode) without their login.

const FIELDS = ["thankYouMode", "thankYouDelay", "googleReviewUrl", "emailFromName", "emailReplyTo", "instagramUrl", "websiteUrl", "defaultLanguage", "brandSignOff"] as const;

const patchSchema = z.object({
  restaurantId: z.string().min(1),
  thankYouMode: z.enum(["ASK", "AUTO", "OFF"]).optional(),
  thankYouDelay: z.enum(["IMMEDIATE", "MIN_30", "HOUR_2", "NEXT_MORNING"]).optional(),
  googleReviewUrl: webUrl(500).nullable().optional(),
  emailFromName: z.string().trim().min(1).max(80).nullable().optional(),
  emailReplyTo: z.string().trim().email().max(200).nullable().optional(),
  instagramUrl: webUrl(300).nullable().optional(),
  websiteUrl: webUrl(300).nullable().optional(),
  defaultLanguage: z.enum(["en", "es"]).optional(),
  brandSignOff: z.string().trim().max(120).nullable().optional(),
  // Venue profile, not settings — shown in the email footer.
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

async function snapshot(restaurantId: string) {
  const [settings, premium, restaurant] = await Promise.all([
    getSettings(restaurantId),
    hasPremiumFeatures(restaurantId),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, address: true, phone: true, email: true } }),
  ]);
  const picked: Record<string, unknown> = {};
  for (const f of FIELDS) picked[f] = settings[f];
  return { settings: picked, premium, restaurant };
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  return NextResponse.json(await snapshot(restaurantId));
}

export async function PATCH(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid request" }, { status: 400 });
  }
  const { restaurantId, address, phone, ...patch } = parsed.data;
  if (address !== undefined || phone !== undefined) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { ...(address !== undefined ? { address: address || null } : {}), ...(phone !== undefined ? { phone: phone || null } : {}) },
    });
  }
  // Same rule the venue's own page enforces: sending needs Premium.
  if (patch.thankYouMode && patch.thankYouMode !== "OFF" && !(await hasPremiumFeatures(restaurantId))) {
    return NextResponse.json({ error: "This venue isn't on Premium — thank-you emails can't be switched on until they upgrade." }, { status: 403 });
  }
  const data = {
    ...patch,
    ...(patch.googleReviewUrl ? { googleReviewUrl: normalizeReviewLink(patch.googleReviewUrl) } : {}),
    ...(patch.thankYouMode ? { thankYouEmailEnabled: patch.thankYouMode !== "OFF" } : {}),
  };
  await prisma.restaurantSettings.upsert({
    where: { restaurantId },
    create: { restaurantId, ...data },
    update: data,
  });
  emitFloorChange(restaurantId, "settings");
  return NextResponse.json(await snapshot(restaurantId));
}
