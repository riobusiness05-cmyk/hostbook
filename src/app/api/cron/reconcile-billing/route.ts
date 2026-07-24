import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingEvent } from "@/lib/billing/subscription";

export const dynamic = "force-dynamic";

/**
 * Batch-flips lapsed trials to EXPIRED. Not required for correctness — every
 * read already resolves trial expiry lazily (see resolveEffectiveStatus in
 * src/lib/billing/subscription.ts) — but a restaurant that never logs back
 * in would otherwise sit at a stale "TRIAL" status forever, which would
 * throw off the platform admin's counts. Wire this to a real scheduler
 * (Vercel Cron, a cron-job.org ping, etc.) once deployed; guarded by
 * CRON_SECRET so it can't be triggered by an outsider.
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

  return NextResponse.json({ reconciled: lapsed.length });
}

export async function POST(req: NextRequest) {
  return reconcile(req);
}

export async function GET(req: NextRequest) {
  return reconcile(req);
}
