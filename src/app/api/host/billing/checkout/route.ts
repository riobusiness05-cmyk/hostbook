import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { checkoutSchema } from "@/lib/billing/schemas";
import { getOrCreateSubscriptionRow, reconcileSubscriptionFromStripe, TRIAL_DAYS } from "@/lib/billing/subscription";
import { createCheckoutSession, getOrCreateStripeCustomer, hasLiveStripeSubscription, isStripeConfigured } from "@/lib/stripe";
import { HostFlowError } from "@/lib/hostflow/actions";
import { resolveMonthlyPriceId } from "@/lib/billing/plans";

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

    // Refuse to start a second Checkout session if Stripe already shows a
    // live subscription for this customer. Trusting our own `status` column
    // here is exactly what let a restaurant get billed twice once already —
    // a missed webhook left it stuck looking unsubscribed even after they'd
    // paid, so they paid again. Self-heal the local row to match Stripe
    // instead of just blocking, so the fix is immediate.
    if (await hasLiveStripeSubscription(customerId)) {
      await reconcileSubscriptionFromStripe(ctx.restaurantId);
      throw new HostFlowError("You already have an active subscription — refresh this page to see it.", 409);
    }

    // Only offer Stripe's built-in trial for accounts that haven't already
    // had one (avoids letting someone repeatedly reset a free trial).
    const trialDays = sub.trialStartedAt ? undefined : TRIAL_DAYS;

    // A Plan row's stripeMonthlyPriceId is normally set once via the Stripe
    // dashboard/API — stripePriceIdFor falls back to the plan's env var
    // (STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID / STRIPE_PREMIUM_MONTHLY_PRICE_ID)
    // so a tier works the moment that var is set, no DB backfill needed.
    const planWithPrice = {
      ...plan,
      stripeMonthlyPriceId: await resolveMonthlyPriceId(plan),
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
