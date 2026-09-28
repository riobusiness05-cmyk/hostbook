import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { previewPlanChange } from "@/lib/billing/upgradePreview";
import { PREMIUM_PLAN_KEY } from "@/lib/billing/catalogue";

// Read-only: what would happen if this venue upgraded right now. Asks
// Stripe for a preview invoice; creates and changes nothing.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const planKey = url.searchParams.get("planKey") || PREMIUM_PLAN_KEY;
  if (!restaurantId) return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });

  try {
    const preview = await previewPlanChange(restaurantId, planKey);
    return NextResponse.json({ preview });
  } catch (err) {
    console.error("[platform upgrade-preview]", err);
    return NextResponse.json({ error: (err as Error).message || "Preview failed" }, { status: 500 });
  }
}
