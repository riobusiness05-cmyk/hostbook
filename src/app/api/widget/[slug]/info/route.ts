import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRestaurantBySlug } from "@/lib/restaurant";

// Public, unauthenticated: the embeddable booking widget's first call, so it
// knows the venue name/branding/limits before rendering the form. Only
// fields already shown on the restaurant's own public site are exposed —
// nothing internal (no ids beyond slug, no settings, no table data) — the
// no-show fields below are the one deliberate exception, since the guest
// needs to know upfront a card will be required before they start booking.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }
  const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } });
  // Protection only actually applies once the restaurant's own Stripe
  // account is connected — a restaurant that flipped the toggle on before
  // finishing Connect onboarding shouldn't block guests from booking.
  const noShowActive = !!settings?.noShowProtectionEnabled && !!restaurant.stripeConnectAccountId;

  return NextResponse.json({
    name: restaurant.name,
    timezone: restaurant.timezone,
    maxPartySize: restaurant.maxPartySize,
    brandColor: restaurant.brandColor,
    logoUrl: restaurant.logoUrl,
    noShowProtection: noShowActive
      ? { feeCents: settings!.noShowFeeCents ?? 0, minPartySize: settings!.noShowMinPartySize ?? 1 }
      : null,
  });
}
