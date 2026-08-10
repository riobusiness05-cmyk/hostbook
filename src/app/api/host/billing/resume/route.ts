import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { getOrCreateSubscriptionRow, getBillingState, logBillingEvent } from "@/lib/billing/subscription";
import { reactivateStripeSubscription, isStripeConfigured } from "@/lib/stripe";
import { HostFlowError } from "@/lib/hostflow/actions";
import { prisma } from "@/lib/prisma";

// Undoes a scheduled cancellation (Stripe's `cancel_at_period_end`) — only
// possible while the subscription hasn't actually ended yet.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req, { requireAccess: false });
  if ("error" in ctx) return ctx.error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
  }

  try {
    const sub = await getOrCreateSubscriptionRow(ctx.restaurantId);
    if (!sub.stripeSubscriptionId) {
      throw new HostFlowError("No subscription to resume.", 409);
    }
    if (!sub.cancelAtPeriodEnd) {
      throw new HostFlowError("This subscription isn't scheduled for cancellation.", 409);
    }

    await reactivateStripeSubscription(sub.stripeSubscriptionId);
    await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false } });
    await logBillingEvent(ctx.restaurantId, sub.id, "REACTIVATED", "Scheduled cancellation undone");

    const billing = await getBillingState(ctx.restaurantId);
    return NextResponse.json({ billing });
  } catch (err) {
    return handleActionError(err);
  }
}
