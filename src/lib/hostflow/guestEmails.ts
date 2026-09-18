import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/hostflow/floor";
import { fillThankYouTemplate, sendEmail, sendingDomain, thankYouEmailHtml } from "@/lib/email";
import { DEFAULT_THANK_YOU_BODY, DEFAULT_THANK_YOU_SUBJECT } from "./constants";
import { hasPremiumFeatures } from "@/lib/billing/subscription";
import type { Restaurant } from "@prisma/client";
import type { SettingsDTO } from "@/lib/hostflow/floor";

// Guest-facing email a restaurant sends in its own name: booking
// confirmations, and (Premium) the post-visit thank-you with a Google review
// link. Everything here is best-effort — a mail problem must never stop a
// booking or a table release.

// ── Sender identity ──────────────────────────────────────────────────────

/** The address a restaurant's guest emails come from: its slug on our
 *  verified sending domain, so "The Colonial <the-colonial@hostflow.space>"
 *  works for every venue with zero DNS setup on their side. */
export function senderAddressFor(restaurant: Pick<Restaurant, "slug">): string {
  return `${restaurant.slug}@${sendingDomain()}`;
}

export function senderIdentityFor(
  restaurant: Pick<Restaurant, "slug" | "name" | "email">,
  settings: Pick<SettingsDTO, "emailFromName" | "emailReplyTo">
): { from: { name: string; address: string }; replyTo?: string } {
  return {
    from: { name: settings.emailFromName?.trim() || restaurant.name, address: senderAddressFor(restaurant) },
    replyTo: settings.emailReplyTo?.trim() || restaurant.email?.trim() || undefined,
  };
}

// ── Thank-you email ──────────────────────────────────────────────────────

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
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export type ThankYouCandidate = { reservationId: string; customerName: string; customerEmail: string };

/**
 * Whether a thank-you *could* go to this reservation's guest right now —
 * feature on, plan includes it, guest left an email, not already sent. The
 * table panel uses this to decide whether to ask staff after a release.
 */
export async function thankYouCandidateFor(restaurantId: string, reservationId: string): Promise<ThankYouCandidate | null> {
  const settings = await getSettings(restaurantId);
  if (!settings.thankYouEmailEnabled) return null;
  if (!(await hasPremiumFeatures(restaurantId))) return null;
  const r = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, restaurantId: true, customerName: true, customerEmail: true, thankYouEmailSentAt: true },
  });
  if (!r || r.restaurantId !== restaurantId || !r.customerEmail || r.thankYouEmailSentAt) return null;
  return { reservationId: r.id, customerName: r.customerName, customerEmail: r.customerEmail };
}

export type ThankYouOutcome = { sent: true; to: string } | { sent: false; reason: string };

/**
 * Sends the thank-you email for a reservation whose party has left. Skips
 * quietly (with a reason, for logs) when the restaurant hasn't turned the
 * feature on, the guest left no email, or it already went out.
 */
export async function sendThankYouForReservation(restaurantId: string, reservationId: string): Promise<ThankYouOutcome> {
  const settings = await getSettings(restaurantId);
  if (!settings.thankYouEmailEnabled) return { sent: false, reason: "Thank-you emails are switched off in Settings → Emails." };
  // Premium feature: a venue that downgraded keeps its wording saved, but
  // nothing goes out until they're back on Premium.
  if (!(await hasPremiumFeatures(restaurantId))) return { sent: false, reason: "Thank-you emails are part of the Premium plan." };

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.restaurantId !== restaurantId) return { sent: false, reason: "Booking not found." };
  if (!reservation.customerEmail) return { sent: false, reason: "This booking has no email address." };
  if (reservation.thankYouEmailSentAt) return { sent: false, reason: "Already sent." };

  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const { subject, html } = renderThankYouEmail(restaurant, settings, firstName(reservation.customerName));

  // Claim the send before making it, so two staff tapping "Send" at once
  // can't produce two emails — a duplicate thank-you looks careless in a
  // way a rare missing one doesn't.
  const claimed = await prisma.reservation.updateMany({
    where: { id: reservationId, thankYouEmailSentAt: null },
    data: { thankYouEmailSentAt: new Date() },
  });
  if (claimed.count === 0) return { sent: false, reason: "Already sent." };

  const result = await sendEmail({ to: reservation.customerEmail, subject, html, ...senderIdentityFor(restaurant, settings) });
  if (!result.ok) {
    // Release the claim so staff can try again.
    await prisma.reservation.update({ where: { id: reservationId }, data: { thankYouEmailSentAt: null } });
    console.error("[thank-you email] failed", reservationId, result.error);
    return { sent: false, reason: result.error ?? "The email couldn't be sent." };
  }
  return { sent: true, to: reservation.customerEmail };
}
