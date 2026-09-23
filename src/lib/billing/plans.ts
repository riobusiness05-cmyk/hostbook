import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import { PLAN_CATALOGUE } from "./catalogue";
import { getClient, isStripeConfigured } from "@/lib/stripe";

export * from "./catalogue";

let ensured: Promise<void> | null = null;

/** Upserts every catalogue plan. Memoised per process — cheap to call from
 *  anywhere that lists or resolves plans. Never touches Stripe price ids. */
export function ensurePlanCatalogue(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const p of PLAN_CATALOGUE) {
        const data = {
          name: p.name,
          description: p.description,
          monthlyPriceCents: p.monthlyPriceCents,
          sortOrder: p.sortOrder,
          features: JSON.stringify(p.features),
          isActive: true,
        };
        await prisma.plan.upsert({ where: { key: p.key }, create: { key: p.key, ...data }, update: data });
      }
    })().catch((err) => {
      ensured = null; // let the next caller retry rather than caching a failure
      throw err;
    });
  }
  return ensured;
}

/** The Stripe price to charge for a plan — the row's own id first, then the
 *  env fallback so a new tier works the moment its env var is set. */
export function stripePriceIdFor(plan: Pick<Plan, "key" | "stripeMonthlyPriceId" | "stripeAnnualPriceId">, interval: "MONTH" | "YEAR"): string | null {
  if (interval === "YEAR") return plan.stripeAnnualPriceId ?? null;
  if (plan.stripeMonthlyPriceId) return plan.stripeMonthlyPriceId;
  const def = PLAN_CATALOGUE.find((p) => p.key === plan.key);
  return (def && process.env[def.monthlyPriceEnv]) || null;
}

// A plan's env var may hold a price id ("price_…") or, since that's what the
// Stripe dashboard shows most prominently, a product id ("prod_…"). A
// product is resolved to its active monthly price once and remembered.
const resolvedPriceByProduct = new Map<string, string>();

/** The Stripe price to actually charge for a plan's monthly billing. */
export async function resolveMonthlyPriceId(plan: Pick<Plan, "key" | "stripeMonthlyPriceId" | "stripeAnnualPriceId">): Promise<string | null> {
  const configured = stripePriceIdFor(plan, "MONTH");
  if (!configured || !configured.startsWith("prod_")) return configured;
  const cached = resolvedPriceByProduct.get(configured);
  if (cached) return cached;
  if (!isStripeConfigured()) return null;
  const stripe = getClient();
  const prices = await stripe.prices.list({ product: configured, active: true, type: "recurring", limit: 20 });
  const monthly = prices.data.find((p) => p.recurring?.interval === "month") ?? prices.data[0];
  let priceId: string | null = monthly?.id ?? null;
  if (!priceId) {
    const product = await stripe.products.retrieve(configured);
    priceId = typeof product.default_price === "string" ? product.default_price : product.default_price?.id ?? null;
  }
  if (priceId) resolvedPriceByProduct.set(configured, priceId);
  return priceId;
}

type PriceRef = string | { id: string; product?: string | { id: string } | null } | null | undefined;

/** Which plan a Stripe price belongs to — how a webhook knows what was bought.
 *  Matches on the price id, or on its product when a plan is configured by
 *  product id. */
export async function planForStripePrice(price: PriceRef): Promise<Plan | null> {
  if (!price) return null;
  const priceId = typeof price === "string" ? price : price.id;
  const productId = typeof price === "string" ? null : typeof price.product === "string" ? price.product : price.product?.id ?? null;
  const byRow = await prisma.plan.findFirst({
    where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }] },
  });
  if (byRow) return byRow;
  const def = PLAN_CATALOGUE.find((p) => {
    const configured = process.env[p.monthlyPriceEnv];
    if (!configured) return false;
    if (configured === priceId) return true;
    if (productId && configured === productId) return true;
    return resolvedPriceByProduct.get(configured) === priceId;
  });
  return def ? prisma.plan.findUnique({ where: { key: def.key } }) : null;
}

