import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/hostflow/floor";
import { fillThankYouTemplate, sendEmail, thankYouEmailHtml } from "@/lib/email";
import { DEFAULT_THANK_YOU_BODY, DEFAULT_THANK_YOU_SUBJECT } from "./constants";
import { hasPremiumFeatures } from "@/lib/billing/subscription";
import type { Restaurant } from "@prisma/client";
import type { SettingsDTO } from "@/lib/hostflow/floor";

// Guest-facing email a restaurant sends in its own name. Today that's one
// message: the post-visit thank-you with a Google review link, sent the
// moment staff release a booked table. Everything here is best-effort —
// a mail problem must never stop a table being freed.

/** The finished subject + HTML for a given guest, exactly as it would be sent. */
export function renderThankYouEmail(
  restaurant: Pick<Restaurant, "name" | "brandColor" | "logoUrl" | "address">,
  settings: Pick<SettingsDTO, "thankYouEmailSubject" | "thankYouEmailBody" | "googleReviewUrl">,
  customerName: string
): { subject: string; html: string } {
  const subjectTemplate = settings.thankYouEmailSubject?.trim() || DEFAULT_THANK_YOU_SUBJECT;
  const bodyTemplate = settings.thankYouEmailBody?.trim() || DEFAULT_THANK_YOU_BODY;
  const subject = fillThankYouTemplate(subjectTemplate, { name: customerName, restaurant: restaurant.name });
  const html = thankYouEmailHtml({
    restaurantName: restaurant.name,
    brandColor: restaurant.brandColor,
    logoUrl: restaurant.logoUrl,
    address: restaurant.address,
    customerName,
    subject: subjectTemplate,
    message: bodyTemplate,
    reviewUrl: settings.googleReviewUrl,
  });
  return { subject, html };
}

/** First name only — "Hi Maria," reads like a person wrote it, "Hi Maria García Lopez," doesn't. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export type ThankYouOutcome = { sent: true } | { sent: false; reason: string };

/**
 * Sends the thank-you email for a reservation whose party has just left.
 * Skips quietly (with a reason, for logs) when the restaurant hasn't turned
 * the feature on, the guest left no email, or it already went out.
 */
export async function sendThankYouForReservation(restaurantId: string, reservationId: string): Promise<ThankYouOutcome> {
  const settings = await getSettings(restaurantId);
  if (!settings.thankYouEmailEnabled) return { sent: false, reason: "disabled" };
  // Premium feature: a venue that downgraded keeps its wording saved, but
  // nothing goes out until they're back on Premium.
  if (!(await hasPremiumFeatures(restaurantId))) return { sent: false, reason: "plan" };

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.restaurantId !== restaurantId) return { sent: false, reason: "reservation not found" };
  if (!reservation.customerEmail) return { sent: false, reason: "no email on booking" };
  if (reservation.thankYouEmailSentAt) return { sent: false, reason: "already sent" };

  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const { subject, html } = renderThankYouEmail(restaurant, settings, firstName(reservation.customerName));

  // Claim the send before making it, so a second release racing this one
  // sees the stamp and stops — a duplicate thank-you looks careless in a
  // way a rare missing one doesn't.
  const claimed = await prisma.reservation.updateMany({
    where: { id: reservationId, thankYouEmailSentAt: null },
    data: { thankYouEmailSentAt: new Date() },
  });
  if (claimed.count === 0) return { sent: false, reason: "already sent" };

  const result = await sendEmail({
    to: reservation.customerEmail,
    subject,
    html,
    fromName: restaurant.name,
    replyTo: restaurant.email ?? undefined,
  });
  if (!result.ok) {
    // Release the claim so staff can try again later if they want to.
    await prisma.reservation.update({ where: { id: reservationId }, data: { thankYouEmailSentAt: null } });
    console.error("[thank-you email] failed", reservationId, result.error);
    return { sent: false, reason: result.error ?? "send failed" };
  }
  return { sent: true };
}
