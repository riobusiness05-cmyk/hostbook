import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { createGuestCardSetupIntent } from "@/lib/stripeConnect";
import { isStripeConfigured } from "@/lib/stripe";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Public, unauthenticated — starts a card save (no charge) for a guest
// booking through the embeddable widget on a restaurant with no-show
// protection enabled. Mirrors the rate-limit/slug-resolution pattern of the
// sibling reservations route.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`widget-setup-intent:${params.slug}:${ip}`, 10 * 60 * 1000, 10);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many attempts — please try again in a few minutes." }, { status: 429 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card verification isn't available right now." }, { status: 503 });
  }

  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  try {
    const { clientSecret } = await createGuestCardSetupIntent(restaurant);
    return NextResponse.json({
      clientSecret,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      connectedAccountId: restaurant.stripeConnectAccountId,
    });
  } catch (err) {
    console.error("[widget setup-intent]", params.slug, err);
    return NextResponse.json({ error: (err as Error).message || "Couldn't start card verification." }, { status: 500 });
  }
}
