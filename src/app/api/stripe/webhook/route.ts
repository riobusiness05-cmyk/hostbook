import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getClient, mapStripeStatus } from "@/lib/stripe";
import { logBillingEvent, wasStripeEventProcessed } from "@/lib/billing/subscription";

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

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = customerIdOf(session);
  if (!customerId) return;
  const sub = await findSubByCustomer(customerId);
  if (!sub) return;
  // Status/period fields are set by the subscription.created/updated event
  // that Stripe fires alongside this one — this handler just logs the event.
  await logBillingEvent(sub.restaurantId, sub.id, "CHECKOUT_COMPLETED", undefined, event.id);
}

async function handleSubscriptionUpsert(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(stripeSub);
  if (!customerId) return;
  const existing = await findSubByCustomer(customerId);
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
  if (!customerId) return;
  const existing = await findSubByCustomer(customerId);
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
  if (!customerId) return;
  const existing = await findSubByCustomer(customerId);
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
  if (!customerId) return;
  const existing = await findSubByCustomer(customerId);
  if (!existing) return;

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: { status: "PAST_DUE", lastPaymentStatus: "failed" },
  });
  await logBillingEvent(updated.restaurantId, updated.id, "PAYMENT_FAILED", undefined, event.id);
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
