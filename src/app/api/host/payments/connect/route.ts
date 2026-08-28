import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { isStripeConfigured } from "@/lib/stripe";
import { createOrGetConnectOnboardingLink } from "@/lib/stripeConnect";

// Starts (or resumes) Stripe Connect onboarding for the logged-in venue's
// OWN Stripe account — separate from /api/host/billing/checkout, which is
// the platform's SaaS billing (restaurant paying Host Flow). This is for
// no-show protection (guest paying the restaurant directly).
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 503 });
  }

  try {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } });
    const url = await createOrGetConnectOnboardingLink(restaurant);
    return NextResponse.json({ url });
  } catch (err) {
    return handleActionError(err);
  }
}
