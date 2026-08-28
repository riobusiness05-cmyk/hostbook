import { NextResponse } from "next/server";
import { getActiveRestaurant } from "@/lib/restaurant";
import { createGuestCardSetupIntent } from "@/lib/stripeConnect";
import { isStripeConfigured } from "@/lib/stripe";

// POST /api/setup-intent (public) — starts a card save (no charge) for the
// marketing site's own booking form (src/components/ReservationForm.tsx),
// single-tenant equivalent of /api/widget/[slug]/setup-intent.
export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card verification isn't available right now." }, { status: 503 });
  }

  const restaurant = await getActiveRestaurant();

  try {
    const { clientSecret } = await createGuestCardSetupIntent(restaurant);
    return NextResponse.json({ clientSecret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY });
  } catch (err) {
    console.error("[setup-intent]", err);
    return NextResponse.json({ error: (err as Error).message || "Couldn't start card verification." }, { status: 500 });
  }
}
