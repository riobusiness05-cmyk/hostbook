import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { getOrCreateSubscriptionRow, getBillingState, logBillingEvent } from "@/lib/billing/subscription";
import { cancelStripeSubscription, isStripeConfigured } from "@/lib/stripe";
import { HostFlowError } from "@/lib/hostflow/actions";
import { prisma } from "@/lib/prisma";

// Cancels at the end of the current billing period (never immediately) —
// access and data are kept until then, matching the "keep data saved, allow
// reactivation" requirement. The Stripe webhook (customer.subscription.updated)
// will confirm `cancelAtPeriodEnd` back onto the row; we also set it here so
// the UI reflects the change without waiting on the webhook round-trip.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
  }

  try {
    const sub = await getOrCreateSubscriptionRow(ctx.restaurantId);
    if (sub.isComplimentary) {
      throw new HostFlowError("Complimentary accounts don't have a Stripe subscription to cancel.", 409);
    }
    if (!sub.stripeSubscriptionId) {
      throw new HostFlowError("No active subscription to cancel.", 409);
    }

    await cancelStripeSubscription(sub.stripeSubscriptionId, true);
    await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    await logBillingEvent(ctx.restaurantId, sub.id, "CANCELLED", "Cancellation scheduled for end of billing period");

    const billing = await getBillingState(ctx.restaurantId);
    return NextResponse.json({ billing });
  } catch (err) {
    return handleActionError(err);
  }
}
