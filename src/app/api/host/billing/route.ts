import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { getBillingState } from "@/lib/billing/subscription";
import { isStripeConfigured, listRecentInvoices, getDefaultPaymentMethod } from "@/lib/stripe";

// Billing summary for the logged-in venue's Settings → Billing page.
// Invoices and the payment method are fetched live from Stripe (best-effort
// — a Stripe outage or missing customer just means an empty/null value,
// never a broken page).
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  try {
    const state = await getBillingState(ctx.restaurantId);
    let invoices: Awaited<ReturnType<typeof listRecentInvoices>> = [];
    let paymentMethod: Awaited<ReturnType<typeof getDefaultPaymentMethod>> = null;
    if (state.stripeCustomerId && isStripeConfigured()) {
      try {
        invoices = await listRecentInvoices(state.stripeCustomerId);
      } catch (err) {
        console.error("[billing] failed to list invoices", err);
      }
      try {
        paymentMethod = await getDefaultPaymentMethod(state.stripeCustomerId, state.stripeSubscriptionId);
      } catch (err) {
        console.error("[billing] failed to fetch payment method", err);
      }
    }
    const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    return NextResponse.json({
      billing: state,
      invoices,
      paymentMethod,
      plans: plans.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        monthlyPriceCents: p.monthlyPriceCents,
        annualPriceCents: p.annualPriceCents,
        features: JSON.parse(p.features) as string[],
      })),
    });
  } catch (err) {
    return handleActionError(err);
  }
}
