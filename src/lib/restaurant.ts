import { prisma } from "@/lib/prisma";

/**
 * This template is deployed one-instance-per-client, so "the restaurant"
 * for this deployment is resolved here — either by the
 * NEXT_PUBLIC_RESTAURANT_SLUG env var (set per client, see README) or by
 * falling back to the only/first restaurant row in the database.
 *
 * Every query elsewhere in the app still filters by restaurantId, so if
 * you ever consolidate multiple clients into one shared database (true
 * multi-tenant SaaS), you only need to change how the active restaurant
 * is resolved per-request (e.g. by subdomain) — not the query logic.
 *
 * Note: intentionally NOT wrapped in React's `cache()` to avoid depending
 * on a specific React canary export — it's called a handful of times per
 * page render against a local/fast DB, which is fine for this template's
 * scale. Wrap it in `cache()` yourself if you want to dedupe the query.
 */
export async function getActiveRestaurant() {
  const slug = process.env.NEXT_PUBLIC_RESTAURANT_SLUG;

  const restaurant = slug
    ? await prisma.restaurant.findUnique({ where: { slug } })
    : await prisma.restaurant.findFirst({ orderBy: { createdAt: "asc" } });

  if (!restaurant) {
    throw new Error(
      "No restaurant found. Run `npm run db:seed` to create the demo restaurant, or set NEXT_PUBLIC_RESTAURANT_SLUG to an existing slug."
    );
  }

  return restaurant;
}

/**
 * Looks up any restaurant by its public slug — used by the embeddable
 * booking widget (src/app/widget/[slug], src/app/api/widget/[slug]/*),
 * which is the one genuinely multi-tenant, unauthenticated surface in the
 * app: unlike getActiveRestaurant() (fixed per-deployment) or hostContext()
 * (session-authenticated), a widget request arrives from an arbitrary
 * third-party website and names the restaurant itself via the URL. Returns
 * null rather than throwing so callers can 404 cleanly on an unknown/typo'd
 * slug instead of surfacing a 500.
 */
export async function getRestaurantBySlug(slug: string) {
  return prisma.restaurant.findUnique({ where: { slug } });
}
