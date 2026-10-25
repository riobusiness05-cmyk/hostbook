import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { sendEmail, reservationConfirmationHtml } from "@/lib/email";
import { senderIdentityFor } from "@/lib/hostflow/guestEmails";
import { getSettings } from "@/lib/hostflow/floor";
import { venueQuota } from "@/lib/hostflow/quota";
import { appUrl } from "@/lib/stripe";

// A booking confirmation exactly as a guest gets it, for a made-up booking —
// so the operator can see one without creating a real reservation on the
// venue's floor (which would also alert the owner).
const schema = z.object({ restaurantId: z.string().min(1), to: z.string().trim().email().max(200), guestName: z.string().trim().max(60).optional() });

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { restaurantId, to, guestName } = parsed.data;
  const over = await venueQuota(restaurantId, "email-test");
  if (over) return over;

  const [restaurant, settings] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
    getSettings(restaurantId),
  ]);
  const displayName = settings.emailFromName?.trim() || restaurant.name;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = tomorrow.toLocaleDateString("en-CA", { timeZone: restaurant.timezone });
  const result = await sendEmail({
    to,
    subject: `You're booked at ${displayName}`,
    ...senderIdentityFor(restaurant, settings),
    meta: { kind: "BOOKING_CONFIRMATION_TEST", restaurantId },
    html: reservationConfirmationHtml({
      restaurantName: displayName,
      brandColor: restaurant.brandColor,
      address: restaurant.address,
      customerName: guestName || "Sample Guest",
      date,
      time: "20:00",
      partySize: 2,
      // A sample has no real booking to manage; the link lands on the venue's booking page.
      manageUrl: `${appUrl()}/widget/${restaurant.slug}`,
    }),
  });
  if (!result.ok) return NextResponse.json({ error: `Couldn't send — ${result.error}` }, { status: 502 });
  return NextResponse.json({ ok: true, to, subject: `You're booked at ${displayName}` });
}
