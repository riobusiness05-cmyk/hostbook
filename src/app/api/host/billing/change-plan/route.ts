import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { changePlanSchema } from "@/lib/billing/schemas";
import { getOrCreateSubscriptionRow, getBillingState, logBillingEvent } from "@/lib/billing/subscription";
import { ensurePlanCatalogue, resolveMonthlyPriceId } from "@/lib/billing/plans";
import { changeStripeSubscriptionPrice, isStripeConfigured } from "@/lib/stripe";
import { HostFlowError } from "@/lib/hostflow/actions";
import { prisma } from "@/lib/prisma";

// Switches a venue that already pays (a live Stripe subscription) onto a
// different plan, prorated by Stripe. Venues without a live subscription
// (trial, expired) go through Checkout with the plan they want instead —
// the billing page decides which of the two to call.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req, { requireAccess: false });
  if ("error" in ctx) return ctx.error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = changePlanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    await ensurePlanCatalogue();
    const [sub, plan] = await Promise.all([
      getOrCreateSubscriptionRow(ctx.restaurantId),
      prisma.plan.findUnique({ where: { key: parsed.data.planKey } }),
    ]);
    if (!plan || !plan.isActive) throw new HostFlowError("Unknown plan", 404);
    if (sub.isComplimentary) throw new HostFlowError("Complimentary accounts already include every plan's features.", 409);
    if (!sub.stripeSubscriptionId || (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE" && sub.status !== "TRIAL")) {
      throw new HostFlowError("No live subscription to change — start a subscription on the plan you want instead.", 409);
    }
    if (sub.planId === plan.id) throw new HostFlowError(`You're already on ${plan.name}.`, 409);

    const priceId = await resolveMonthlyPriceId(plan);
    if (!priceId) throw new HostFlowError(`${plan.name} isn't available for purchase yet.`, 503);

    await changeStripeSubscriptionPrice(sub.stripeSubscriptionId, priceId);
    // The webhook confirms this too; set it here so the page reflects the
    // change without waiting on the round-trip.
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: plan.id, stripePriceId: priceId, cancelAtPeriodEnd: false },
    });
    await logBillingEvent(ctx.restaurantId, sub.id, "PLAN_CHANGED", `→ ${plan.name} (${priceId})`);

    const billing = await getBillingState(ctx.restaurantId);
    return NextResponse.json({ billing });
  } catch (err) {
    return handleActionError(err);
  }
}
