import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { getConnectAccountStatus } from "@/lib/stripeConnect";

// Live Stripe Connect status for the logged-in venue's own account — called
// on the settings page load and right after the onboarding redirect
// returns, rather than trusting a cached/local flag.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  try {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } });
    const status = await getConnectAccountStatus(restaurant.stripeConnectAccountId);
    return NextResponse.json(status);
  } catch (err) {
    return handleActionError(err);
  }
}
