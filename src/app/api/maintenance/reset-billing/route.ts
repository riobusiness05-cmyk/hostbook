import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetSubscriptionToCleanTrial } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

/**
 * One-time-use maintenance endpoint: resets a restaurant's Subscription row
 * to a clean trial, clearing any stale Stripe references. Same
 * bearer-token-guard pattern as /api/cron/reconcile-billing, guarded by its
 * own secret (MAINTENANCE_SECRET) so it can't be triggered by an outsider.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MAINTENANCE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "MAINTENANCE_SECRET is not set." }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const slug = body?.restaurantSlug;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "restaurantSlug is required" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  const sub = await resetSubscriptionToCleanTrial(restaurant.id);
  return NextResponse.json({ ok: true, restaurant: restaurant.name, status: sub.status, trialEndsAt: sub.trialEndsAt });
}
