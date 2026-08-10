import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/restaurant";

// Public, unauthenticated: the embeddable booking widget's first call, so it
// knows the venue name/branding/limits before rendering the form. Only
// fields already shown on the restaurant's own public site are exposed —
// nothing internal (no ids beyond slug, no settings, no table data).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  return NextResponse.json({
    name: restaurant.name,
    timezone: restaurant.timezone,
    maxPartySize: restaurant.maxPartySize,
    brandColor: restaurant.brandColor,
    logoUrl: restaurant.logoUrl,
  });
}
