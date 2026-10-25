import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { getSlotAvailability } from "@/lib/availability";
import { availabilityQuerySchema } from "@/types";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

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

  const [detailed, sections] = await Promise.all([
    getSlotAvailability({ restaurant, dateStr: parsed.data.date, partySize: parsed.data.partySize, onlineOnly: true }),
    prisma.section.findMany({
      where: { restaurantId: restaurant.id, tables: { some: { isActive: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, note: true, bookableOnline: true },
    }),
  ]);
  // A venue that has written an area note or closed an area to online
  // booking gets the descriptive chooser (full areas shown as full).
  // Everyone else keeps the original compact chooser, untouched.
  const areasCustomised = sections.some((s) => s.note || !s.bookableOnline);

  // `slots` stays a plain list of times for existing consumers; `areasByTime`
  // is what lets the form offer "where would you like to sit?" with only the
  // areas that still have room at the chosen time.
  return NextResponse.json({
    date: parsed.data.date,
    partySize: parsed.data.partySize,
    slots: detailed.map((s) => s.time),
    areasByTime: Object.fromEntries(detailed.map((s) => [s.time, s.areas])),
    // Every area a guest may choose, in the venue's order, with its
    // one-line description — so a full area is shown as full, not hidden.
    areas: sections.filter((s) => s.bookableOnline).map((s) => ({ name: s.name, note: s.note })),
    areasCustomised,
  });
}
