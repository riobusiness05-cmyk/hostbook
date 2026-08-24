import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { restaurantIdSchema } from "@/lib/billing/schemas";
import { reconcileSubscriptionFromStripe } from "@/lib/billing/subscription";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = restaurantIdSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const result = await reconcileSubscriptionFromStripe(parsed.data.restaurantId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[platform reconcile-stripe]", err);
    return NextResponse.json({ error: (err as Error).message || "Reconcile failed" }, { status: 500 });
  }
}
