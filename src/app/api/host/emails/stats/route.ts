import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { emailStatsForMonth } from "@/lib/hostflow/guestEmails";
import { hasPremiumFeatures } from "@/lib/billing/subscription";

// This month's thank-you numbers for the dashboard card.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const [stats, premium] = await Promise.all([emailStatsForMonth(ctx.restaurantId), hasPremiumFeatures(ctx.restaurantId)]);
  return NextResponse.json({ ...stats, premium }, { headers: { "Cache-Control": "no-store" } });
}
