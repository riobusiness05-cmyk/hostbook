import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { checkoutSchema } from "@/lib/billing/schemas";
import { getOrCreateSubscriptionRow, TRIAL_DAYS } from "@/lib/billing/subscription";
import { createCheckoutSession, getOrCreateStripeCustomer, isStripeConfigured } from "@/lib/stripe";
import { HostFlowError } from "@/lib/hostflow/actions";

// Starts (or resumes) a Stripe Checkout session for the logged-in venue.
// Ensures a Stripe customer exists first so the resulting subscription is
// always linked back to our Subscription row via stripeCustomerId.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req, { requireAccess: false });
  if ("error" in ctx) return ctx.error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet. Add your Stripe keys to .env to enable checkout." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [restaurant, account, sub, plan] = await Promise.all([
      prisma.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } }),
      prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } }),
      getOrCreateSubscriptionRow(ctx.restaurantId),
      prisma.plan.findUnique({ where: { key: parsed.data.planKey } }),
    ]);
    if (!plan) throw new HostFlowError("Unknown plan", 404);
    if (sub.isComplimentary) throw new HostFlowError("This account already has full complimentary access.", 409);

    const customerId = await getOrCreateStripeCustomer(restaurant, account, sub.stripeCustomerId);
    if (customerId !== sub.stripeCustomerId) {
      await prisma.subscription.update({ where: { restaurantId: ctx.restaurantId }, data: { stripeCustomerId: customerId } });
    }

    // Only offer Stripe's built-in trial for accounts that haven't already
    // had one (avoids letting someone repeatedly reset a free trial).
    const trialDays = sub.trialStartedAt ? undefined : TRIAL_DAYS;

    // The Plan row's stripeMonthlyPriceId is normally set once via the
    // Stripe dashboard/API when a plan is created — it falls back to
    // STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID here so the Professional plan
    // works the moment that env var is set, without needing a DB migration
    // to backfill it.
    const planWithPrice = {
      ...plan,
      stripeMonthlyPriceId: plan.stripeMonthlyPriceId || process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || null,
    };

    const url = await createCheckoutSession({
      restaurantId: ctx.restaurantId,
      customerId,
      plan: planWithPrice,
      interval: parsed.data.interval,
      trialDays,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return handleActionError(err);
  }
}
