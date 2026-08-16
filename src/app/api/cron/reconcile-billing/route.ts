import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingEvent } from "@/lib/billing/subscription";
import { createCheckoutSession } from "@/lib/stripe";
import { sendEmail, paymentRequiredEmailHtml } from "@/lib/email";

export const dynamic = "force-dynamic";

const TRIAL_ENDING_SOON_DAYS = 2;
const PAYMENT_REQUIRED_EVENT_TYPE = "PAYMENT_REQUIRED_EMAIL_SENT";

// Emails the owner once when their trial is about to end, with a link to add
// a payment method. Dedup guard mirrors every other billing-event check in
// this codebase: skip if that BillingEvent type already exists for this
// subscription, so a daily cron run never re-sends it.
async function sendTrialEndingSoonEmails() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const soonThreshold = new Date(Date.now() + TRIAL_ENDING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const endingSoon = await prisma.subscription.findMany({
    where: {
      status: "TRIAL",
      isComplimentary: false,
      trialEndsAt: { gte: new Date(), lte: soonThreshold },
    },
    include: { plan: true, restaurant: { select: { name: true } } },
  });

  let sent = 0;
  for (const sub of endingSoon) {
    const alreadySent = await prisma.billingEvent.findFirst({
      where: { subscriptionId: sub.id, type: PAYMENT_REQUIRED_EVENT_TYPE },
    });
    if (alreadySent) continue;

    const owner = await prisma.account.findFirst({
      where: { restaurantId: sub.restaurantId, role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) continue;

    let checkoutUrl = `${appUrl}/host/settings`;
    if (sub.stripeCustomerId && sub.plan) {
      try {
        checkoutUrl = await createCheckoutSession({
          restaurantId: sub.restaurantId,
          customerId: sub.stripeCustomerId,
          plan: sub.plan,
          interval: (sub.billingInterval as "MONTH" | "YEAR") ?? "MONTH",
        });
      } catch (err) {
        console.error("[reconcile-billing] checkout session creation failed, falling back to settings link", err);
      }
    }

    const daysLeft = Math.max(1, Math.ceil((sub.trialEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    try {
      const result = await sendEmail({
        to: owner.email,
        subject: "Your Host Flow trial is ending soon",
        html: paymentRequiredEmailHtml({ restaurantName: sub.restaurant.name, checkoutUrl, daysLeft }),
      });
      if (!result.ok) console.error("[reconcile-billing] payment-required email failed", result.error);
    } catch (err) {
      console.error("[reconcile-billing] payment-required email failed", err);
    }

    await logBillingEvent(sub.restaurantId, sub.id, PAYMENT_REQUIRED_EVENT_TYPE, `${daysLeft} days left`);
    sent++;
  }

  return sent;
}

/**
 * Batch-flips lapsed trials to EXPIRED. Not required for correctness — every
 * read already resolves trial expiry lazily (see resolveEffectiveStatus in
 * src/lib/billing/subscription.ts) — but a restaurant that never logs back
 * in would otherwise sit at a stale "TRIAL" status forever, which would
 * throw off the platform admin's counts. Wire this to a real scheduler
 * (Vercel Cron, a cron-job.org ping, etc.) once deployed; guarded by
 * CRON_SECRET so it can't be triggered by an outsider.
 *
 * Also emails owners whose trial is ending soon (see sendTrialEndingSoonEmails
 * above) — same daily run, same guard.
 */
async function reconcile(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set. Add it to .env to enable this endpoint." }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lapsed = await prisma.subscription.findMany({
    where: { status: "TRIAL", isComplimentary: false, trialEndsAt: { lt: new Date() } },
  });

  for (const sub of lapsed) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
    await logBillingEvent(sub.restaurantId, sub.id, "TRIAL_EXPIRED");
  }

  const paymentRequiredEmailsSent = await sendTrialEndingSoonEmails();

  return NextResponse.json({ reconciled: lapsed.length, paymentRequiredEmailsSent });
}

export async function POST(req: NextRequest) {
  return reconcile(req);
}

export async function GET(req: NextRequest) {
  return reconcile(req);
}
