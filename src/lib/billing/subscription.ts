import { prisma } from "@/lib/prisma";
import { ensurePlanCatalogue, isPremium, planForStripePrice } from "./plans";
import { getClient, isStripeConfigured, mapStripeStatus } from "@/lib/stripe";
import type { Subscription } from "@prisma/client";

/**
 * The single source of truth for "what can this restaurant do right now,
 * billing-wise." Every other surface — the host-app access gate, the
 * Billing settings page, the marketing site pricing, the platform admin
 * panel — reads through this module rather than touching Subscription rows
 * directly, so the interpretation of status/trial/complimentary can never
 * drift between call sites.
 *
 * Mirrors the getSettings()-style "find or create the one row for this
 * restaurant" pattern already used in src/lib/hostflow/floor.ts.
 */

export const TRIAL_DAYS = 7;
export const DEFAULT_PLAN_KEY = "professional";

export type BillingStatus = "COMPLIMENTARY" | "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export type PlanDTO = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  features: string[];
};

export type BillingState = {
  restaurantId: string;
  status: BillingStatus;
  storedStatus: string; // the raw DB value, before lazy trial-expiry resolution
  isComplimentary: boolean;
  complimentaryReason: string | null;
  plan: PlanDTO | null;
  billingInterval: "MONTH" | "YEAR";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastPaymentStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeConfigured: boolean;
  hasAccess: boolean;
  canStartCheckout: boolean;
  canManageBilling: boolean;
  canCancel: boolean;
  canResume: boolean;
};

function toPlanDTO(plan: { id: string; key: string; name: string; description: string | null; monthlyPriceCents: number; annualPriceCents: number | null; features: string } | null): PlanDTO | null {
  if (!plan) return null;
  let features: string[] = [];
  try {
    features = JSON.parse(plan.features);
  } catch {
    features = [];
  }
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    annualPriceCents: plan.annualPriceCents,
    features,
  };
}

async function getDefaultPlan() {
  await ensurePlanCatalogue();
  return prisma.plan.findFirst({ where: { key: DEFAULT_PLAN_KEY } });
}

/** Whether a restaurant is on a plan that includes the premium-only
 *  features (branded guest emails). Complimentary accounts always are. */
export async function hasPremiumFeatures(restaurantId: string): Promise<boolean> {
  return isPremium(await getBillingState(restaurantId));
}

/** `{ planId }` for the plan a Stripe price belongs to, or nothing if the
 *  price is unknown — so an unrecognised price never clears the plan. */
async function planIdForPrice(price: Parameters<typeof planForStripePrice>[0]): Promise<{ planId?: string }> {
  const plan = await planForStripePrice(price);
  return plan ? { planId: plan.id } : {};
}

/** Finds the restaurant's Subscription row, creating a fresh trial if none exists yet. */
export async function getOrCreateSubscriptionRow(restaurantId: string) {
  const existing = await prisma.subscription.findUnique({ where: { restaurantId }, include: { plan: true } });
  if (existing) return existing;

  const plan = await getDefaultPlan();
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60000);
  return prisma.subscription.create({
    data: { restaurantId, planId: plan?.id, status: "TRIAL", trialStartedAt: now, trialEndsAt },
    include: { plan: true },
  });
}

/** Trial rows expire lazily: the DB may still say TRIAL after trialEndsAt has
 *  passed until something writes to the row (a login, an admin action, or
 *  the reconciliation cron) — so every read resolves the *effective* status
 *  here rather than trusting the stored value blindly. */
function resolveEffectiveStatus(sub: Pick<Subscription, "status" | "isComplimentary" | "trialEndsAt">): BillingStatus {
  if (sub.isComplimentary) return "COMPLIMENTARY";
  if (sub.status === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt.getTime() < Date.now()) {
    return "EXPIRED";
  }
  return sub.status as BillingStatus;
}

function computeHasAccess(status: BillingStatus): boolean {
  // PAST_DUE keeps access during Stripe's dunning/retry window rather than
  // hard-locking on the first failed charge — the billing banner surfaces
  // the problem so the owner can fix their card via the portal.
  return status === "COMPLIMENTARY" || status === "TRIAL" || status === "ACTIVE" || status === "PAST_DUE";
}

export async function getBillingState(restaurantId: string): Promise<BillingState> {
  const sub = await getOrCreateSubscriptionRow(restaurantId);
  const status = resolveEffectiveStatus(sub);
  const hasAccess = computeHasAccess(status);
  const trialDaysRemaining =
    sub.trialEndsAt && status === "TRIAL"
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60000)))
      : null;

  return {
    restaurantId,
    status,
    storedStatus: sub.status,
    isComplimentary: sub.isComplimentary,
    complimentaryReason: sub.complimentaryReason,
    plan: toPlanDTO(sub.plan),
    billingInterval: sub.billingInterval as "MONTH" | "YEAR",
    trialStartedAt: sub.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    trialDaysRemaining,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    lastPaymentStatus: sub.lastPaymentStatus,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    stripeConfigured: isStripeConfigured(),
    hasAccess,
    canStartCheckout: !sub.isComplimentary && status !== "ACTIVE" && status !== "PAST_DUE",
    canManageBilling: !!sub.stripeCustomerId && isStripeConfigured(),
    canCancel: !sub.isComplimentary && !!sub.stripeSubscriptionId && !sub.cancelAtPeriodEnd && (status === "ACTIVE" || status === "TRIAL" || status === "PAST_DUE"),
    canResume: !!sub.stripeSubscriptionId && sub.cancelAtPeriodEnd,
  };
}

export async function hasAccess(restaurantId: string): Promise<boolean> {
  const state = await getBillingState(restaurantId);
  return state.hasAccess;
}

export async function listActivePlans(): Promise<PlanDTO[]> {
  await ensurePlanCatalogue();
  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  return plans.map((p) => toPlanDTO(p)!);
}

// ── Billing event log ───────────────────────────────────────────────────

export async function logBillingEvent(
  restaurantId: string,
  subscriptionId: string | null,
  type: string,
  message?: string,
  stripeEventId?: string
) {
  await prisma.billingEvent.create({
    data: { restaurantId, subscriptionId, type, message, stripeEventId },
  });
}

export async function wasStripeEventProcessed(stripeEventId: string): Promise<boolean> {
  const existing = await prisma.billingEvent.findUnique({ where: { stripeEventId } });
  return !!existing;
}

// ── Lifecycle mutations ────────────────────────────────────────────────
// Every mutation here is the *only* place its concern is implemented, so
// the seed script, the registration flow, and the platform admin panel all
// call the same functions instead of duplicating status-transition logic.

export async function startTrial(restaurantId: string, planKey: string = DEFAULT_PLAN_KEY) {
  const plan = await prisma.plan.findUnique({ where: { key: planKey } });
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60000);
  const sub = await prisma.subscription.upsert({
    where: { restaurantId },
    create: { restaurantId, planId: plan?.id, status: "TRIAL", trialStartedAt: now, trialEndsAt },
    update: { planId: plan?.id, status: "TRIAL", trialStartedAt: now, trialEndsAt, isComplimentary: false },
  });
  await logBillingEvent(restaurantId, sub.id, "TRIAL_STARTED", `${TRIAL_DAYS}-day trial started`);
  return sub;
}

/**
 * The one reusable mechanism behind every complimentary account — The
 * Colonial gets this via the seed script calling this exact function, but
 * so can any restaurant an admin chooses to comp later. Nothing here is
 * specific to any single tenant.
 */
export async function grantComplimentary(
  restaurantId: string,
  opts: { reason?: string; grantedBy?: string; planKey?: string } = {}
) {
  const plan = await prisma.plan.findUnique({ where: { key: opts.planKey ?? DEFAULT_PLAN_KEY } });
  const sub = await prisma.subscription.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      planId: plan?.id,
      status: "COMPLIMENTARY",
      isComplimentary: true,
      complimentaryReason: opts.reason,
      complimentaryGrantedBy: opts.grantedBy,
      complimentaryGrantedAt: new Date(),
    },
    update: {
      planId: plan?.id,
      status: "COMPLIMENTARY",
      isComplimentary: true,
      complimentaryReason: opts.reason,
      complimentaryGrantedBy: opts.grantedBy,
      complimentaryGrantedAt: new Date(),
    },
  });
  await logBillingEvent(restaurantId, sub.id, "COMPLIMENTARY_GRANTED", opts.reason);
  return sub;
}

/**
 * Converts a complimentary account into a paying one "with one action" —
 * clears the complimentary flag and drops them into a fresh trial so the
 * owner completes checkout themselves next time they open Billing (we
 * can't forge a payment method on their behalf).
 */
export async function convertComplimentaryToPaid(restaurantId: string) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60000);
  const sub = await prisma.subscription.update({
    where: { restaurantId },
    data: {
      isComplimentary: false,
      complimentaryReason: null,
      status: "TRIAL",
      trialStartedAt: now,
      trialEndsAt,
    },
  });
  await logBillingEvent(restaurantId, sub.id, "COMPLIMENTARY_CONVERTED", "Converted from complimentary to a paid trial");
  return sub;
}

export async function extendTrial(restaurantId: string, days: number) {
  const existing = await prisma.subscription.findUniqueOrThrow({ where: { restaurantId } });
  const base = existing.trialEndsAt && existing.trialEndsAt.getTime() > Date.now() ? existing.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60000);
  const sub = await prisma.subscription.update({
    where: { restaurantId },
    data: { trialEndsAt, status: existing.isComplimentary ? existing.status : "TRIAL" },
  });
  await logBillingEvent(restaurantId, sub.id, "TRIAL_EXTENDED", `Extended by ${days} day(s)`);
  return sub;
}

export async function suspendSubscription(restaurantId: string) {
  const sub = await prisma.subscription.update({
    where: { restaurantId },
    data: { status: "CANCELLED", isComplimentary: false, cancelledAt: new Date() },
  });
  await logBillingEvent(restaurantId, sub.id, "ADMIN_SUSPENDED");
  return sub;
}

export async function reactivateSubscription(restaurantId: string) {
  const existing = await prisma.subscription.findUniqueOrThrow({ where: { restaurantId } });
  const now = new Date();
  const data = existing.stripeSubscriptionId
    ? { status: "ACTIVE" as const } // corrected by the next Stripe webhook if it's actually still cancelled there
    : { status: "TRIAL" as const, trialStartedAt: now, trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60000) };
  const sub = await prisma.subscription.update({ where: { restaurantId }, data });
  await logBillingEvent(restaurantId, sub.id, "REACTIVATED");
  return sub;
}

/**
 * Resets a restaurant to a clean, fresh trial and clears every Stripe
 * reference on the row. Needed after switching Stripe from test mode to
 * live mode: a Subscription row can be left pointing at a
 * stripeCustomerId/stripeSubscriptionId that only ever existed in the old
 * mode, which is otherwise permanently stuck (every Stripe call against it
 * 404s in the new mode) — this is the only way back to a working state
 * short of the row staying broken forever.
 */
export async function resetSubscriptionToCleanTrial(restaurantId: string) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60000);
  const sub = await prisma.subscription.update({
    where: { restaurantId },
    data: {
      status: "TRIAL",
      isComplimentary: false,
      trialStartedAt: now,
      trialEndsAt,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      lastPaymentStatus: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
    },
  });
  await logBillingEvent(restaurantId, sub.id, "TRIAL_STARTED", "Reset to a clean trial (stale Stripe references cleared)");
  return sub;
}

// ── Reconciliation ─────────────────────────────────────────────────────
// Every webhook handler only updates a Subscription row it can already find
// by stripeCustomerId — if that link is missing or stale (the customer paid
// through a path that never wrote it back, or a webhook delivery was lost),
// the row silently never advances past TRIAL and nothing about it is logged.
// This asks Stripe directly "what does this restaurant actually have right
// now" and corrects the row to match, so a missed webhook is recoverable
// instead of being permanent. Used by the platform admin's "Reconcile from
// Stripe" action and by the reconcile-billing cron.

export type ReconcileResult = {
  matched: boolean;
  source: "existing_customer" | "email_search" | "none";
  before: { status: string; stripeCustomerId: string | null };
  after: { status: string; stripeCustomerId: string | null } | null;
};

export async function reconcileSubscriptionFromStripe(restaurantId: string): Promise<ReconcileResult> {
  const stripe = getClient();
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { restaurantId },
    include: { restaurant: { select: { email: true } } },
  });
  const before = { status: sub.status, stripeCustomerId: sub.stripeCustomerId };

  let customerId = sub.stripeCustomerId;
  let source: ReconcileResult["source"] = "existing_customer";

  if (!customerId) {
    const owner = await prisma.account.findFirst({ where: { restaurantId, role: "OWNER" }, orderBy: { createdAt: "asc" } });
    const email = sub.restaurant.email || owner?.email;
    if (email) {
      const found = await stripe.customers.list({ email, limit: 1 });
      if (found.data[0]) {
        customerId = found.data[0].id;
        source = "email_search";
      }
    }
  }

  if (!customerId) {
    await logBillingEvent(restaurantId, sub.id, "RECONCILE_NO_STRIPE_MATCH", "No Stripe customer found by existing id or account email");
    return { matched: false, source: "none", before, after: null };
  }

  // Most recent subscription for this customer, any status — a cancelled or
  // past_due one still tells us the truth, which matters more than only
  // ever looking at "active" ones.
  const stripeSubs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  const stripeSub = stripeSubs.data[0];

  if (!stripeSub) {
    if (customerId !== sub.stripeCustomerId) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { stripeCustomerId: customerId } });
    }
    await logBillingEvent(restaurantId, sub.id, "RECONCILE_NO_SUBSCRIPTION", `Found Stripe customer ${customerId} (via ${source}) but it has no subscription`);
    return { matched: true, source, before, after: null };
  }

  const item = stripeSub.items.data[0];
  const status = mapStripeStatus(stripeSub.status);
  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: item?.price?.id ?? null,
      ...(await planIdForPrice(item?.price)),
      currentPeriodStart: item ? new Date(item.current_period_start * 1000) : sub.currentPeriodStart,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : sub.currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      lastPaymentStatus: stripeSub.status,
    },
  });
  await logBillingEvent(
    restaurantId,
    sub.id,
    "RECONCILED_FROM_STRIPE",
    `${before.status} → ${status} (matched via ${source}, stripe subscription ${stripeSub.id})`
  );
  return { matched: true, source, before, after: { status: updated.status, stripeCustomerId: updated.stripeCustomerId } };
}

// Read-only visibility for exactly the situation reconcileSubscriptionFromStripe
// can't fully untangle on its own: a duplicate checkout creates a SECOND
// Stripe customer for the same restaurant (getOrCreateStripeCustomer only
// reuses an existing one if the link was already present), so there can be
// more than one customer/subscription pair to sort out by hand — cancel the
// duplicate, keep the real one. This never mutates anything in Stripe or the
// database; it only lists what's there so a human can decide.
export type StripeCustomerSummary = {
  id: string;
  createdAt: string;
  isCurrentlyLinked: boolean;
  subscriptions: {
    id: string;
    status: string;
    priceId: string | null;
    amountCents: number | null;
    currency: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }[];
};

export async function listStripeCustomersForRestaurant(restaurantId: string): Promise<StripeCustomerSummary[]> {
  const stripe = getClient();
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { restaurantId },
    include: { restaurant: { select: { email: true } } },
  });
  const owner = await prisma.account.findFirst({ where: { restaurantId, role: "OWNER" }, orderBy: { createdAt: "asc" } });
  const email = sub.restaurant.email || owner?.email;

  // Every customer Stripe has for this email, not just the first — this is
  // the whole point: `.list` with `limit: 1` (used elsewhere for the normal
  // reconcile path) would silently hide a duplicate.
  const customers = email ? (await stripe.customers.list({ email, limit: 20 })).data : [];
  // The linked stripeCustomerId might belong to a *different* email if it
  // was set by hand or via an old/renamed account — always include it too,
  // deduplicated, so it's never missing from the picture even if the email
  // search above wouldn't have found it.
  if (sub.stripeCustomerId && !customers.some((c) => c.id === sub.stripeCustomerId)) {
    const linked = await stripe.customers.retrieve(sub.stripeCustomerId);
    if (!linked.deleted) customers.push(linked);
  }

  const results: StripeCustomerSummary[] = [];
  for (const customer of customers) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
    results.push({
      id: customer.id,
      createdAt: new Date(customer.created * 1000).toISOString(),
      isCurrentlyLinked: customer.id === sub.stripeCustomerId,
      subscriptions: subs.data.map((s) => {
        const item = s.items.data[0];
        return {
          id: s.id,
          status: s.status,
          priceId: item?.price?.id ?? null,
          amountCents: item?.price?.unit_amount ?? null,
          currency: item?.price?.currency ?? null,
          currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
          cancelAtPeriodEnd: s.cancel_at_period_end,
        };
      }),
    });
  }
  return results;
}
