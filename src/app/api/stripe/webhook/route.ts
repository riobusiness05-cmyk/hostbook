import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getClient, mapStripeStatus, createBillingPortalSession } from "@/lib/stripe";
import { logBillingEvent, wasStripeEventProcessed } from "@/lib/billing/subscription";
import { sendEmail, paymentFailedEmailHtml } from "@/lib/email";

async function notifyOwnerPaymentFailed(restaurantId: string, stripeCustomerId: string | null) {
  // Never lets an email failure affect the webhook's response — the
  // Subscription update + BillingEvent log (what actually matters for
  // correctness/idempotency) have already committed by the time this runs.
  try {
    if (!stripeCustomerId) return;
    const owner = await prisma.account.findFirst({
      where: { restaurantId, role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) return;
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
    if (!restaurant) return;
    const portalUrl = await createBillingPortalSession(stripeCustomerId);
    const result = await sendEmail({
      to: owner.email,
      subject: "Action needed: your Host Flow payment failed",
      html: paymentFailedEmailHtml({ restaurantName: restaurant.name, portalUrl }),
    });
    if (!result.ok) console.error("[stripe webhook] payment-failed email failed", result.error);
  } catch (err) {
    console.error("[stripe webhook] payment-failed email failed", err);
  }
}

// Public endpoint — Stripe calls this directly, no session cookie. Signature
// verification (below) is what proves a request genuinely came from Stripe.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function customerIdOf(obj: { customer: string | Stripe.Customer | Stripe.DeletedCustomer | null }): string | null {
  if (!obj.customer) return null;
  return typeof obj.customer === "string" ? obj.customer : obj.customer.id;
}

async function findSubByCustomer(customerId: string) {
  return prisma.subscription.findUnique({ where: { stripeCustomerId: customerId } });
}

// Every handler's real point of failure: stripeCustomerId can be missing or
// stale (payment made outside the app's own checkout route, a Stripe
// test-mode → live-mode switch, a race between checkout and the first
// webhook). Falling back to the restaurantId Stripe carries in metadata —
// set on both the Checkout Session and the Subscription itself, see
// createCheckoutSession in src/lib/stripe.ts — recovers from that instead
// of silently dropping the event. When it saves the day, it also re-links
// stripeCustomerId so the next event doesn't need the fallback again.
async function findSubOrFallback(
  event: Stripe.Event,
  customerId: string | null,
  metadataRestaurantId: string | null | undefined
) {
  if (customerId) {
    const byCustomer = await findSubByCustomer(customerId);
    if (byCustomer) return byCustomer;
  }
  if (metadataRestaurantId) {
    const byRestaurant = await prisma.subscription.findUnique({ where: { restaurantId: metadataRestaurantId } });
    if (byRestaurant) {
      if (customerId && byRestaurant.stripeCustomerId !== customerId) {
        return prisma.subscription.update({ where: { id: byRestaurant.id }, data: { stripeCustomerId: customerId } });
      }
      return byRestaurant;
    }
  }
  // Genuinely nothing to attach this to — can't log a BillingEvent (it
  // requires a real restaurantId), so this console.error is the only trace.
  // Check Vercel logs for this line, or use the platform admin's "Reconcile
  // from Stripe" action once you know which restaurant it should have been.
  console.error(
    `[stripe webhook] no Subscription matched — event=${event.id} type=${event.type} customer=${customerId ?? "none"} metadataRestaurantId=${metadataRestaurantId ?? "none"}`
  );
  return null;
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = customerIdOf(session);
  const sub = await findSubOrFallback(event, customerId, session.metadata?.restaurantId ?? session.client_reference_id);
  if (!sub) return;
  // Status/period fields are set by the subscription.created/updated event
  // that Stripe fires alongside this one — this handler just logs the event.
  await logBillingEvent(sub.restaurantId, sub.id, "CHECKOUT_COMPLETED", undefined, event.id);
}

async function handleSubscriptionUpsert(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(stripeSub);
  const existing = await findSubOrFallback(event, customerId, stripeSub.metadata?.restaurantId);
  if (!existing) return;

  const item = stripeSub.items.data[0];
  const status = mapStripeStatus(stripeSub.status);

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: item?.price?.id ?? null,
      currentPeriodStart: item ? new Date(item.current_period_start * 1000) : existing.currentPeriodStart,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : existing.currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      lastPaymentStatus: stripeSub.status,
    },
  });
  await logBillingEvent(
    updated.restaurantId,
    updated.id,
    event.type === "customer.subscription.created" ? "SUBSCRIPTION_CREATED" : "SUBSCRIPTION_UPDATED",
    `status=${status}`,
    event.id
  );
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(stripeSub);
  const existing = await findSubOrFallback(event, customerId, stripeSub.metadata?.restaurantId);
  if (!existing) return;

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelAtPeriodEnd: false },
  });
  await logBillingEvent(updated.restaurantId, updated.id, "CANCELLED", "Cancelled in Stripe", event.id);
}

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = customerIdOf(invoice);
  // Invoices don't carry restaurantId metadata themselves — by the time one
  // fires, the subscription.created/updated handler above should already
  // have linked (or self-healed) stripeCustomerId, so customerId-only
  // lookup is enough; findSubOrFallback still logs instead of dropping
  // silently on the rare miss.
  const existing = await findSubOrFallback(event, customerId, null);
  if (!existing) return;

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: { lastPaymentStatus: "paid" },
  });
  await logBillingEvent(updated.restaurantId, updated.id, "PAYMENT_SUCCEEDED", undefined, event.id);
}

async function handleInvoiceFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = customerIdOf(invoice);
  const existing = await findSubOrFallback(event, customerId, null);
  if (!existing) return;

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: { status: "PAST_DUE", lastPaymentStatus: "failed" },
  });
  await logBillingEvent(updated.restaurantId, updated.id, "PAYMENT_FAILED", undefined, event.id);
  await notifyOwnerPaymentFailed(updated.restaurantId, updated.stripeCustomerId);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: Stripe may redeliver the same event; skip if already handled.
  if (await wasStripeEventProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event);
        break;
      default:
        break; // not an event type we act on
    }
  } catch (err) {
    console.error(`[stripe webhook] handler error for ${event.type}`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
