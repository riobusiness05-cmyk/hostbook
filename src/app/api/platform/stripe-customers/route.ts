import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { listStripeCustomersForRestaurant } from "@/lib/billing/subscription";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = new URL(req.url).searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });

  try {
    const customers = await listStripeCustomersForRestaurant(restaurantId);
    return NextResponse.json({ customers });
  } catch (err) {
    console.error("[platform stripe-customers]", err);
    return NextResponse.json({ error: (err as Error).message || "Lookup failed" }, { status: 500 });
  }
}
