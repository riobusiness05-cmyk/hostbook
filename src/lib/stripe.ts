import Stripe from "stripe";
import type { Restaurant, Account, Plan, Subscription } from "@prisma/client";

/**
 * Thin Stripe wrapper. Every call goes through `getClient()`, which throws a
 * clear, catchable error if STRIPE_SECRET_KEY isn't set — the same "not
 * configured yet" pattern as `getClient()` in src/lib/claude.ts for
 * ANTHROPIC_API_KEY. Nothing here requires real Stripe keys to exist; the
 * app degrades gracefully (billing UI shows "not configured") until they're
 * added to .env, exactly like the AI chat widget does today.
 */

let _client: Stripe | null = null;
export function getClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add it to your .env file to enable billing.");
  }
  if (!_client) {
    _client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

// ── Customers ────────────────────────────────────────────────────────────

/**
 * Ensures a Stripe Customer exists for this restaurant's subscription,
 * creating one on first call. Safe to call repeatedly — idempotent by
 * checking `subscription.stripeCustomerId` first.
 */
export async function getOrCreateStripeCustomer(
  restaurant: Pick<Restaurant, "id" | "name" | "email">,
  account: Pick<Account, "email" | "name">,
  existingCustomerId?: string | null
): Promise<string> {
  const stripe = getClient();
  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    name: restaurant.name,
    email: restaurant.email || account.email,
    metadata: { restaurantId: restaurant.id },
  });
  return customer.id;
}

// ── Checkout ─────────────────────────────────────────────────────────────

export type CheckoutInterval = "MONTH" | "YEAR";

/**
 * Creates a Stripe Checkout session for a restaurant to subscribe to a plan.
 * New paid signups get a 30-day trial baked into the subscription itself
 * (`subscription_data.trial_period_days`) so the guest never has to leave
 * Checkout to start their trial — Stripe handles the trial→paid conversion
 * automatically when the trial ends.
 */
export async function createCheckoutSession(params: {
  restaurantId: string;
  customerId: string;
  plan: Pick<Plan, "stripeMonthlyPriceId" | "stripeAnnualPriceId">;
  interval: CheckoutInterval;
  trialDays?: number;
}): Promise<string> {
  const stripe = getClient();
  const priceId = params.interval === "YEAR" ? params.plan.stripeAnnualPriceId : params.plan.stripeMonthlyPriceId;
  if (!priceId) {
    throw new Error(`No Stripe price configured for interval ${params.interval}. Set it up in the Stripe dashboard first.`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: params.trialDays ? { trial_period_days: params.trialDays } : undefined,
    success_url: `${appUrl()}/host/settings?checkout=success`,
    cancel_url: `${appUrl()}/host/settings?checkout=cancelled`,
    client_reference_id: params.restaurantId,
    metadata: { restaurantId: params.restaurantId },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

// ── Billing portal ───────────────────────────────────────────────────────

export async function createBillingPortalSession(customerId: string): Promise<string> {
  const stripe = getClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/host/settings`,
  });
  return session.url;
}

// ── Invoices ─────────────────────────────────────────────────────────────

export type InvoiceSummary = {
  id: string;
  number: string | null;
  amountPaidCents: number;
  currency: string;
  status: string | null;
  createdAt: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export async function listRecentInvoices(customerId: string, limit = 10): Promise<InvoiceSummary[]> {
  const stripe = getClient();
  const invoices = await stripe.invoices.list({ customer: customerId, limit });
  return invoices.data.map((inv) => ({
    id: inv.id ?? "",
    number: inv.number,
    amountPaidCents: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    createdAt: new Date(inv.created * 1000).toISOString(),
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
  }));
}

// ── Subscription lifecycle helpers (used by the webhook handler) ─────────

export async function cancelStripeSubscription(stripeSubscriptionId: string, atPeriodEnd = true): Promise<void> {
  const stripe = getClient();
  if (atPeriodEnd) {
    await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
  } else {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  }
}

export async function reactivateStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getClient();
  await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: false });
}

/** Maps a Stripe subscription status to our internal Subscription.status. */
export function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "trialing":
      return "TRIAL";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete_expired":
      return "EXPIRED";
    default:
      return "ACTIVE";
  }
}

export type { Subscription };
