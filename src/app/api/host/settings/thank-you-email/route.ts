import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { getSettings } from "@/lib/hostflow/floor";
import { renderThankYouEmail, senderIdentityFor } from "@/lib/hostflow/guestEmails";
import { sendEmail } from "@/lib/email";
import { hasPremiumFeatures } from "@/lib/billing/subscription";

// The thank-you email as the guest will see it. GET renders a preview of
// what's currently SAVED (the settings page embeds it in an iframe); POST
// sends that same email to the signed-in account's own address so the host
// can check it in a real inbox before turning it on.

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const [restaurant, settings] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } }),
    getSettings(ctx.restaurantId),
  ]);
  const { html } = renderThankYouEmail(restaurant, settings, "Maria");
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const testSchema = z.object({ to: z.string().trim().email().optional() });

// Sends the saved thank-you to an address of the host's choosing (default:
// their own login email) so they can see it in a real inbox first.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  if (!(await hasPremiumFeatures(ctx.restaurantId))) {
    return NextResponse.json({ error: "Guest thank-you emails are part of the Premium plan." }, { status: 403 });
  }
  const parsed = testSchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address to send the test to." }, { status: 400 });

  const [restaurant, settings, account] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } }),
    getSettings(ctx.restaurantId),
    prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId }, select: { email: true, name: true } }),
  ]);
  const to = parsed.data.to || account.email;
  const { subject, html } = renderThankYouEmail(restaurant, settings, account.name?.split(/\s+/)[0] || "there");
  const result = await sendEmail({
    to,
    subject: `[Test] ${subject}`,
    html,
    ...senderIdentityFor(restaurant, settings),
    meta: { kind: "THANK_YOU_TEST", restaurantId: ctx.restaurantId },
  });
  if (!result.ok) return NextResponse.json({ error: `Couldn't send — ${result.error}` }, { status: 502 });
  return NextResponse.json({ ok: true, to });
}
