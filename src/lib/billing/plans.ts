import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import { PLAN_CATALOGUE } from "./catalogue";

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

/** Which plan a Stripe price belongs to — how a webhook knows what was bought. */
export async function planForStripePrice(priceId: string | null | undefined): Promise<Plan | null> {
  if (!priceId) return null;
  const byRow = await prisma.plan.findFirst({
    where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }] },
  });
  if (byRow) return byRow;
  const def = PLAN_CATALOGUE.find((p) => process.env[p.monthlyPriceEnv] === priceId);
  return def ? prisma.plan.findUnique({ where: { key: def.key } }) : null;
}

