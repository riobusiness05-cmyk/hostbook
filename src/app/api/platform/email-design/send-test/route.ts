import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { loadBrandKit, renderSampleThankYous, senderIdentityFor } from "@/lib/hostflow/guestEmails";
import { validateTemplate } from "@/lib/emailTemplate";
import { normalizeReviewLink } from "@/lib/brandKit";
import { venueQuota } from "@/lib/hostflow/quota";

// Sends one real thank-you, rendered with the design in the editor (saved
// or not), to an address the platform admin picks — so a design can be
// shown to a venue's owner in a real inbox before they've upgraded or the
// design has been saved. Platform admin only; never reaches a guest.
const schema = z.object({
  restaurantId: z.string().min(1),
  html: z.string().max(200_000),
  to: z.string().trim().email().max(200),
  guestName: z.string().trim().max(60).optional(),
  /** Stand-in review link for a venue that hasn't set one yet, so the
   *  sample still shows its review button. Never saved. */
  reviewUrl: z.string().trim().url().max(600).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address to send the sample to." }, { status: 400 });
  const { restaurantId, html, to, guestName, reviewUrl } = parsed.data;
  const over = await venueQuota(restaurantId, "email-test");
  if (over) return over;

  if (html.trim()) {
    const problems = validateTemplate(html);
    if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 422 });
  }

  const standIn = reviewUrl ? normalizeReviewLink(reviewUrl) : null;
  const overrides = {
    thankYouEmailHtml: html.trim() ? html : null,
    ...(standIn ? { googleReviewUrl: standIn, googlePlaceId: null } : {}),
  };
  const { restaurant, settings } = await loadBrandKit(restaurantId, overrides);
  // The log row exists first so the review button can track back to it.
  const log = await prisma.emailLog.create({
    data: { restaurantId, kind: "THANK_YOU_TEST", to, subject: "(rendering)", status: "PENDING" },
  });
  // A stand-in link isn't saved, so the tracked redirect couldn't find it —
  // link the button straight to it instead.
  const [sample] = await renderSampleThankYous(restaurantId, overrides, standIn ? undefined : `l:${log.id}`, guestName || undefined);
  const result = await sendEmail({
    to,
    subject: sample.subject,
    html: sample.html,
    ...senderIdentityFor(restaurant, settings),
    meta: { kind: "THANK_YOU_TEST", restaurantId, logId: log.id },
  });
  if (!result.ok) return NextResponse.json({ error: `Couldn't send — ${result.error}` }, { status: 502 });
  return NextResponse.json({ ok: true, to, subject: sample.subject });
}
