import { NextRequest, NextResponse } from "next/server";
import { venueQuota } from "@/lib/hostflow/quota";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { loadBrandKit, renderSampleThankYous, senderIdentityFor } from "@/lib/hostflow/guestEmails";
import { sendEmail } from "@/lib/email";
import { hasPremiumFeatures } from "@/lib/billing/subscription";

// The thank-you as a guest will see it, from what's currently SAVED. GET
// renders the first sample (the settings page's live preview iframe); POST
// sends it to an address of the host's choosing (default: their own login
// email) so they can check it in a real inbox.

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const [sample] = await renderSampleThankYous(ctx.restaurantId);
  return new NextResponse(sample.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const testSchema = z.object({ to: z.string().trim().email().optional() });

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  if (!(await hasPremiumFeatures(ctx.restaurantId))) {
    return NextResponse.json({ error: "Guest thank-you emails are part of the Premium plan." }, { status: 403 });
  }
  const over = await venueQuota(ctx.restaurantId, "email-test");
  if (over) return over;
  const parsed = testSchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address to send the test to." }, { status: 400 });

  const [{ restaurant, settings }, account] = await Promise.all([
    loadBrandKit(ctx.restaurantId),
    prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId }, select: { email: true, name: true } }),
  ]);
  const to = parsed.data.to || account.email;
  // A test that greets the person sending it reads as proof; real sends use
  // the first name on the booking or whatever staff typed at the door.
  const testName = account.name?.trim().split(/\s+/)[0] || undefined;
  // The log row exists before the email is rendered, so its review button
  // can carry a link back to this exact row for click tracking.
  const log = await prisma.emailLog.create({
    data: { restaurantId: ctx.restaurantId, kind: "THANK_YOU_TEST", to, subject: "(rendering)", status: "PENDING" },
  });
  const [sample] = await renderSampleThankYous(ctx.restaurantId, {}, `l:${log.id}`, testName);
  const result = await sendEmail({
    to,
    subject: `[Test] ${sample.subject}`,
    html: sample.html,
    ...senderIdentityFor(restaurant, settings),
    meta: { kind: "THANK_YOU_TEST", restaurantId: ctx.restaurantId, logId: log.id },
  });
  if (!result.ok) return NextResponse.json({ error: `Couldn't send — ${result.error}` }, { status: 502 });
  return NextResponse.json({ ok: true, to });
}
