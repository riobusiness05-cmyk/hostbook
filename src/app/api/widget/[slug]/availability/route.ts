import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { getAvailableSlots } from "@/lib/availability";
import { availabilityQuerySchema } from "@/types";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Without this, Next.js can treat a GET route handler as statically
// cacheable and serve a stale response without ever re-invoking this
// function — which would silently skip the rate-limit check below on every
// repeat request for the same date/partySize.
export const dynamic = "force-dynamic";

// Public, unauthenticated — same availability engine as the admin-facing
// /api/availability, just resolved by slug instead of the single
// per-deployment active restaurant. Deliberately reuses getAvailableSlots
// as-is (booking-window cap, opening hours, blackout dates, combo-table
// fallback, service-pacing cap) rather than any parallel logic, so a widget
// booking is checked against exactly the same rules a direct booking would be.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const ip = getClientIp(req);
  // Generous — this is read-only and legitimate use can fire it repeatedly
  // (checking several dates/party sizes), just not unboundedly.
  const rl = await checkRateLimit(`widget-availability:${params.slug}:${ip}`, 60 * 1000, 60);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = availabilityQuerySchema.safeParse({
    date: searchParams.get("date"),
    partySize: searchParams.get("partySize"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const slots = await getAvailableSlots({
    restaurant,
    dateStr: parsed.data.date,
    partySize: parsed.data.partySize,
  });

  return NextResponse.json({ date: parsed.data.date, partySize: parsed.data.partySize, slots });
}
