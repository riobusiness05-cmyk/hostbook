// Client-safe plan catalogue: no Prisma, no env — importable from React
// components (billing page, settings) as well as server code.

// Defined in code so every environment (local seed, production, the
// marketing page, checkout) agrees on what exists and what each tier
// includes. Plan rows are global, not per-restaurant; ensurePlanCatalogue()
// in plans.ts keeps the database in step with this list.

export const PROFESSIONAL_PLAN_KEY = "professional";
export const PREMIUM_PLAN_KEY = "premium";

export const PROFESSIONAL_FEATURES = [
  "Unlimited reservations",
  "AI table allocation",
  "Booking website",
  "Live floor plans",
  "Waitlist management",
  "Staff accounts",
  "Analytics",
  "Workflows",
];

export const PREMIUM_FEATURES = [
  "Everything in Professional",
  "Branded thank-you emails to every guest",
  "Google review link after each visit",
  "Your own logo and colours on guest emails",
  "Priority support",
];

export type PlanDefinition = {
  key: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  sortOrder: number;
  features: string[];
  /** Env var holding this plan's live Stripe monthly price id, as a fallback
   *  for a Plan row that hasn't had stripeMonthlyPriceId set directly. */
  monthlyPriceEnv: string;
};

export const PLAN_CATALOGUE: PlanDefinition[] = [
  {
    key: PROFESSIONAL_PLAN_KEY,
    name: "Professional",
    description: "Everything a high-volume restaurant or bar needs to run its floor.",
    monthlyPriceCents: 3000,
    sortOrder: 0,
    features: PROFESSIONAL_FEATURES,
    monthlyPriceEnv: "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
  },
  {
    key: PREMIUM_PLAN_KEY,
    name: "Premium",
    description: "Turn every visit into a review. Branded guest emails, sent automatically.",
    monthlyPriceCents: 10000,
    sortOrder: 1,
    features: PREMIUM_FEATURES,
    monthlyPriceEnv: "STRIPE_PREMIUM_MONTHLY_PRICE_ID",
  },
];

/** Premium-only features (guest emails) are open to Premium subscribers and
 *  to complimentary accounts, which have full access by definition. */
export function isPremium(billing: { isComplimentary: boolean; plan: { key: string } | null }): boolean {
  return billing.isComplimentary || billing.plan?.key === PREMIUM_PLAN_KEY;
}
