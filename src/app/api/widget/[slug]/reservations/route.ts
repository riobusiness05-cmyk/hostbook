import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { createReservationForRestaurant } from "@/lib/reservationActions";
import { createReservationSchema } from "@/types";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Public, unauthenticated — the embeddable widget's booking submission.
// Routes through the exact same createReservationForRestaurant used by the
// admin-facing /api/reservations and the AI chat tool: the same
// Serializable-transaction race protection, idempotency-key dedupe, and
// table-combining fallback for large parties. This route's only job is
// resolving *which* restaurant from the URL slug — no booking logic is
// duplicated here, which is what keeps a widget booking exactly as
// trustworthy as one taken any other way.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`widget-booking:${params.slug}:${ip}`, 10 * 60 * 1000, 10);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many booking attempts — please try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) {
    return NextResponse.json({ error: "Unknown restaurant" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reservation", details: parsed.error.flatten() }, { status: 400 });
  }

  let result;
  try {
    // source is fixed here rather than trusted from the request body — a
    // widget embedded on a third-party site should only ever be able to
    // create ordinary web-form bookings, not claim to be e.g. an admin- or
    // phone-taken one.
    result = await createReservationForRestaurant(restaurant, { ...parsed.data, source: "WEB_FORM" });
  } catch (err) {
    console.error("[widget reservations]", params.slug, "booking failed", err);
    return NextResponse.json(
      { error: "We couldn't complete that booking — please try again in a moment." },
      { status: 500 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ reservation: result.data }, { status: 201 });
}
