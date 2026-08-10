import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { getOrCreateSubscriptionRow } from "@/lib/billing/subscription";
import { createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";
import { HostFlowError } from "@/lib/hostflow/actions";

// Opens the Stripe Billing Portal for the logged-in venue — payment methods,
// invoice history, and self-serve cancel/reactivate all live there.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req, { requireAccess: false });
  if ("error" in ctx) return ctx.error;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
  }

  try {
    const sub = await getOrCreateSubscriptionRow(ctx.restaurantId);
    if (!sub.stripeCustomerId) {
      throw new HostFlowError("No billing account yet — start a subscription first.", 409);
    }
    const url = await createBillingPortalSession(sub.stripeCustomerId);
    return NextResponse.json({ url });
  } catch (err) {
    return handleActionError(err);
  }
}
