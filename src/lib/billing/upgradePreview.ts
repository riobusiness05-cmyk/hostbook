import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getClient, isStripeConfigured } from "@/lib/stripe";
import { ensurePlanCatalogue, resolveMonthlyPriceId } from "@/lib/billing/plans";
import { getOrCreateSubscriptionRow } from "@/lib/billing/subscription";

/**
 * A read-only dry run of "this venue upgrades to plan X" — what the billing
 * page would do, what Stripe would charge today, and anything that would
 * make it go wrong. Nothing here writes to Stripe or the database, so it's
 * safe to run as many times as you like before a sales call.
 */

export type UpgradePreview = {
  restaurant: { id: string; name: string };
  target: {
    key: string;
    name: string;
    priceId: string | null;
    amountCents: number | null;
    currency: string | null;
    interval: string | null;
    active: boolean | null;
  };
  local: {
    status: string;
    planKey: string | null;
    planName: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    cancelAtPeriodEnd: boolean;
    isComplimentary: boolean;
  };
  stripe: {
    subscriptionId: string;
    status: string;
    priceId: string | null;
    amountCents: number | null;
    currency: string | null;
    interval: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    collectionMethod: string;
    paymentMethod: string | null;
    latestInvoice: {
      id: string;
      status: string | null;
      amountDueCents: number;
      amountPaidCents: number;
      amountRemainingCents: number;
      currency: string;
      hostedUrl: string | null;
    } | null;
  } | null;
  charge: {
    currency: string;
    dueNowCents: number;
    nextInvoiceCents: number;
    nextInvoiceDate: string | null;
    lines: { description: string; amountCents: number; proration: boolean }[];
  } | null;
  /** What the venue's own billing page would do when they click Upgrade. */
  path: "CHANGE_IN_PLACE" | "CHECKOUT" | "ALREADY_ON_PLAN" | "COMPLIMENTARY";
  blockers: string[];
  warnings: string[];
};

const LIVE_LOCAL = new Set(["ACTIVE", "PAST_DUE", "TRIAL"]);
const LIVE_STRIPE = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due", "unpaid"]);

function lineIsProration(line: Stripe.InvoiceLineItem): boolean {
  const p = line.parent;
  if (!p) return false;
  return !!(p.subscription_item_details?.proration || p.invoice_item_details?.proration);
}

export async function previewPlanChange(restaurantId: string, planKey: string): Promise<UpgradePreview> {
  await ensurePlanCatalogue();
  const [restaurant, sub, target] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { id: true, name: true } }),
    getOrCreateSubscriptionRow(restaurantId),
    prisma.plan.findUnique({ where: { key: planKey } }),
  ]);
  if (!target) throw new Error(`Unknown plan "${planKey}"`);

  const currentPlan = sub.planId ? await prisma.plan.findUnique({ where: { id: sub.planId } }) : null;
  const blockers: string[] = [];
  const warnings: string[] = [];

  const preview: UpgradePreview = {
    restaurant,
    target: { key: target.key, name: target.name, priceId: null, amountCents: null, currency: null, interval: null, active: null },
    local: {
      status: sub.status,
      planKey: currentPlan?.key ?? null,
      planName: currentPlan?.name ?? null,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      isComplimentary: sub.isComplimentary,
    },
    stripe: null,
    charge: null,
    path: "CHANGE_IN_PLACE",
    blockers,
    warnings,
  };

  if (!target.isActive) blockers.push(`${target.name} is not marked active in the plan catalogue.`);
  if (!isStripeConfigured()) {
    blockers.push("STRIPE_SECRET_KEY is not set in this environment.");
    return preview;
  }
  const stripe = getClient();

  // 1. Can the target plan actually be bought?
  const targetPriceId = await resolveMonthlyPriceId(target);
  if (!targetPriceId) {
    blockers.push(`No Stripe price found for ${target.name} — check STRIPE_${target.key.toUpperCase()}_MONTHLY_PRICE_ID.`);
  } else {
    try {
      const price = await stripe.prices.retrieve(targetPriceId);
      preview.target = {
        key: target.key,
        name: target.name,
        priceId: price.id,
        amountCents: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        active: price.active,
      };
      if (!price.active) blockers.push(`The ${target.name} price ${price.id} is archived in Stripe.`);
      if (!price.recurring) blockers.push(`The ${target.name} price ${price.id} is a one-off, not a subscription price.`);
      else if (price.recurring.interval !== "month") warnings.push(`The ${target.name} price bills every ${price.recurring.interval}, not monthly.`);
      if (price.unit_amount != null && price.unit_amount !== target.monthlyPriceCents) {
        warnings.push(
          `Stripe charges ${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()} but the app advertises ${(target.monthlyPriceCents / 100).toFixed(2)} — the guest sees the app's number until they pay.`
        );
      }
    } catch (err) {
      blockers.push(`Stripe couldn't load price ${targetPriceId}: ${(err as Error).message}`);
    }
  }

  // 2. Which path would the venue's billing page take?
  if (sub.isComplimentary) {
    preview.path = "COMPLIMENTARY";
    warnings.push("Complimentary account — already has every plan's features; nothing to upgrade.");
    return preview;
  }
  if (sub.planId === target.id) {
    preview.path = "ALREADY_ON_PLAN";
    warnings.push(`Already on ${target.name} in Host Flow.`);
  } else if (sub.stripeSubscriptionId && LIVE_LOCAL.has(sub.status)) {
    preview.path = "CHANGE_IN_PLACE";
  } else {
    preview.path = "CHECKOUT";
    warnings.push(
      `Host Flow shows this venue as ${sub.status}${sub.stripeSubscriptionId ? "" : " with no Stripe subscription linked"} — the Upgrade button would open a NEW Checkout instead of changing the existing subscription. If Stripe below shows a live subscription, click "Reconcile from Stripe" first.`
    );
  }

  // 3. What does Stripe say about the existing subscription?
  if (sub.stripeSubscriptionId) {
    let s: Stripe.Subscription;
    try {
      s = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
        expand: ["latest_invoice", "default_payment_method", "customer", "customer.invoice_settings.default_payment_method"],
      });
    } catch (err) {
      blockers.push(`Stripe couldn't load subscription ${sub.stripeSubscriptionId}: ${(err as Error).message}`);
      return preview;
    }
    const item = s.items.data[0];
    const inv = typeof s.latest_invoice === "object" && s.latest_invoice ? s.latest_invoice : null;
    const customer = typeof s.customer === "object" && !s.customer.deleted ? s.customer : null;
    const pm =
      typeof s.default_payment_method === "object" && s.default_payment_method
        ? s.default_payment_method
        : null;
    const customerPm = customer?.invoice_settings?.default_payment_method;
    const paymentMethod = pm
      ? describePaymentMethod(pm)
      : customerPm
        ? typeof customerPm === "string"
          ? customerPm
          : describePaymentMethod(customerPm)
        : null;

    preview.stripe = {
      subscriptionId: s.id,
      status: s.status,
      priceId: item?.price?.id ?? null,
      amountCents: item?.price?.unit_amount ?? null,
      currency: item?.price?.currency ?? s.currency ?? null,
      interval: item?.price?.recurring?.interval ?? null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      collectionMethod: s.collection_method,
      paymentMethod,
      latestInvoice: inv
        ? {
            id: inv.id,
            status: inv.status,
            amountDueCents: inv.amount_due,
            amountPaidCents: inv.amount_paid,
            amountRemainingCents: inv.amount_remaining,
            currency: inv.currency,
            hostedUrl: inv.hosted_invoice_url ?? null,
          }
        : null,
    };

    if (!LIVE_STRIPE.has(s.status)) {
      blockers.push(`Stripe subscription ${s.id} is "${s.status}" — a price change can't be applied to it. The venue would need a fresh Checkout.`);
    }
    if (s.status === "past_due" || s.status === "unpaid") {
      warnings.push("The current subscription is past due in Stripe — the upgrade will go through, but the unpaid invoice stays owed and Stripe keeps retrying it.");
    }
    if (s.cancel_at_period_end) {
      warnings.push("Subscription is set to cancel at period end. Upgrading clears that automatically (it's obviously being kept).");
    }
    if (preview.target.currency && preview.stripe.currency && preview.target.currency !== preview.stripe.currency) {
      blockers.push(
        `Currency mismatch: the current subscription bills in ${preview.stripe.currency.toUpperCase()} but the ${target.name} price is in ${preview.target.currency.toUpperCase()}. Stripe refuses to mix currencies on one subscription — create a ${preview.stripe.currency.toUpperCase()} price for ${target.name}.`
      );
    }
    if (s.collection_method === "send_invoice") {
      warnings.push("This subscription is billed by emailed invoice, not automatic card charge — the proration invoice will be emailed and must be paid by hand.");
    } else if (!paymentMethod) {
      warnings.push("No default payment method on the subscription or customer — the proration invoice would fail to collect automatically.");
    }
    if (inv && (inv.status === "open" || inv.status === "draft")) {
      const due = (inv.amount_remaining / 100).toFixed(2);
      warnings.push(
        `The latest invoice ${inv.id} is still ${inv.status} (${due} ${inv.currency.toUpperCase()} outstanding). If that's a payment still settling, it's fine; if it's failed, sort it before adding another charge.`
      );
    }
    if (item?.price?.id === targetPriceId) {
      warnings.push(`Stripe already has this subscription on the ${target.name} price — Host Flow's row is behind. Reconcile from Stripe.`);
    }

    // 4. Exactly what Stripe would charge — a preview invoice, never created.
    if (item && targetPriceId && blockers.length === 0 && preview.path === "CHANGE_IN_PLACE") {
      try {
        const upcoming = await stripe.invoices.createPreview({
          customer: typeof s.customer === "string" ? s.customer : s.customer.id,
          subscription: s.id,
          subscription_details: {
            items: [{ id: item.id, price: targetPriceId }],
            proration_behavior: "always_invoice",
          },
        });
        const lines = upcoming.lines.data.map((l) => ({
          description: l.description ?? "",
          amountCents: l.amount,
          proration: lineIsProration(l),
        }));
        const dueNowCents = lines.filter((l) => l.proration).reduce((n, l) => n + l.amountCents, 0);
        preview.charge = {
          currency: upcoming.currency,
          dueNowCents,
          nextInvoiceCents: preview.target.amountCents ?? 0,
          nextInvoiceDate: preview.stripe.currentPeriodEnd,
          lines,
        };
        if (dueNowCents <= 0) {
          warnings.push("Stripe computes nothing to charge today (the period is at its end) — the full new price lands on the next invoice instead.");
        }
      } catch (err) {
        warnings.push(`Couldn't preview the proration invoice: ${(err as Error).message}`);
      }
    }
  } else if (preview.path === "CHANGE_IN_PLACE") {
    blockers.push("No Stripe subscription id on the Host Flow row.");
  }

  return preview;
}

function describePaymentMethod(pm: Stripe.PaymentMethod): string {
  if (pm.card) return `${pm.card.brand} •••• ${pm.card.last4} (exp ${pm.card.exp_month}/${pm.card.exp_year})`;
  if (pm.sepa_debit) return `SEPA debit •••• ${pm.sepa_debit.last4}`;
  if (pm.link) return "Link";
  return pm.type;
}
