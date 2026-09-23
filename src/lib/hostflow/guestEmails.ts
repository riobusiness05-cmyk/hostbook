import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/hostflow/floor";
import { guestThankYouEmail, sendEmail, sendingDomain } from "@/lib/email";
import { resolveBrandKit, type BrandKit, type Language, THANK_YOU_DELAYS, type ThankYouDelay } from "@/lib/brandKit";
import { composeThankYou } from "./thankYouCopy";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { renderTemplate } from "@/lib/emailTemplate";
import { FONT_STYLES, readableOn } from "@/lib/brandKit";
import { hasPremiumFeatures } from "@/lib/billing/subscription";
import { combineDateAndTime, toLocalDateStr } from "@/lib/availability";
import type { Restaurant } from "@prisma/client";
import type { SettingsDTO } from "@/lib/hostflow/floor";

// Guest-facing email a restaurant sends in its own name: booking
// confirmations, and (Premium) the post-visit thank-you with a Google review
// link. Everything here is best-effort — a mail problem must never stop a
// booking or a table release.

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

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

/** First name only — "Hi Maria," reads like a person wrote it, "Hi Maria García Lopez," doesn't. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function normalizeLanguage(value: string | null | undefined, fallback: Language): Language {
  const v = (value ?? "").toLowerCase().slice(0, 2);
  return v === "es" || v === "en" ? v : fallback;
}

// ── Brand kit ────────────────────────────────────────────────────────────

export async function loadBrandKit(restaurantId: string, overrides: Partial<SettingsDTO> = {}): Promise<{ kit: BrandKit; restaurant: Restaurant; settings: SettingsDTO }> {
  const [restaurant, saved] = await Promise.all([prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }), getSettings(restaurantId)]);
  // `overrides` = a draft the settings page hasn't saved yet (live preview).
  const settings = { ...saved, ...overrides };
  const kit = resolveBrandKit({ restaurant, settings, appUrl: appUrl(), senderAddress: senderAddressFor(restaurant) });
  return { kit, restaurant, settings };
}

// ── Rendering ────────────────────────────────────────────────────────────

export type VisitFacts = {
  firstName: string;
  email: string;
  partySize: number;
  visitAt: Date;
  occasion: string | null;
  visitCount: number;
  language: Language;
  seed: string;
};

export type RenderedThankYou = { subject: string; html: string; text: string; language: Language; headers: Record<string, string> };

/** The complete email for one visit, from the kit and the facts — pure once the kit is loaded. */
export function renderThankYou(kit: BrandKit, settings: Pick<SettingsDTO, "thankYouEmailSubject" | "thankYouEmailBody" | "thankYouEmailHtml">, restaurantId: string, timezone: string, facts: VisitFacts, now = new Date()): RenderedThankYou {
  const composed = composeThankYou({
    firstName: facts.firstName,
    venueName: kit.venueName,
    partySize: facts.partySize,
    visitAt: facts.visitAt,
    now,
    timezone,
    occasion: facts.occasion,
    visitCount: facts.visitCount,
    tone: kit.tone,
    signOff: kit.signOff,
    language: facts.language,
    seed: facts.seed,
    customBody: settings.thankYouEmailBody,
    customSubject: settings.thankYouEmailSubject,
  });
  const unsub = unsubscribeUrl(appUrl(), restaurantId, facts.email);
  const builtIn = guestThankYouEmail(kit, {
    subject: composed.subject,
    paragraphs: composed.paragraphs,
    signOff: composed.signOff,
    unsubscribeUrl: unsub,
    language: facts.language,
  });
  const text = builtIn.text;
  // A hand-designed template (set by the platform admin) replaces the
  // built-in layout; the words and links drop in through placeholders.
  const custom = settings.thankYouEmailHtml?.trim();
  const es = facts.language === "es";
  const font = FONT_STYLES[kit.font];
  const html = custom
    ? renderTemplate(custom, {
        name: facts.firstName,
        venue: kit.venueName,
        subject: composed.subject,
        message: composed.paragraphs.map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("\n"),
        message_text: composed.paragraphs.join("\n\n"),
        sign_off: composed.signOff,
        review_url: kit.reviewUrl,
        review_label: es ? "Déjanos una reseña en Google" : "Leave us a Google review",
        booking_url: kit.bookingUrl,
        book_label: es ? "Reservar mesa" : "Book a table",
        book_line: es ? "Cuando quieras volver, tu mesa está a un toque:" : "Whenever you'd like to come back, your table is a tap away:",
        unsubscribe_url: unsub,
        unsubscribe_label: es ? "Darse de baja de estos correos" : "Unsubscribe from these emails",
        address: kit.address,
        phone: kit.phone,
        instagram_url: kit.instagramUrl,
        website_url: kit.websiteUrl,
        primary: readableOn(kit.primary),
        font_heading: font.heading,
        font_body: font.body,
        year: String(now.getFullYear()),
        language: facts.language,
      })
    : builtIn.html;
  const oneClick = unsub.replace("/email/unsubscribe?", "/api/email/unsubscribe?");
  return {
    subject: composed.subject,
    html,
    text,
    language: facts.language,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Three representative emails — first-timer at dinner, a regular's birthday
 *  with a big table, a lunch — so an owner can judge the tone before it goes
 *  to a real guest. */
export async function renderSampleThankYous(restaurantId: string, overrides: Partial<SettingsDTO> = {}): Promise<{ label: string; subject: string; html: string }[]> {
  const { kit, restaurant, settings } = await loadBrandKit(restaurantId, overrides);
  const now = new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000);
  const lang = kit.defaultLanguage;
  const samples: { label: string; facts: VisitFacts }[] = [
    { label: "First visit, dinner for two", facts: { firstName: lang === "es" ? "Lucía" : "Sarah", email: "guest@example.com", partySize: 2, visitAt: at(2), occasion: null, visitCount: 1, language: lang, seed: "sample-1" } },
    { label: "Regular, birthday, table of six", facts: { firstName: lang === "es" ? "Javier" : "James", email: "guest@example.com", partySize: 6, visitAt: at(3), occasion: "Birthday", visitCount: 4, language: lang, seed: "sample-2" } },
    { label: "Lunch, second visit", facts: { firstName: lang === "es" ? "Marta" : "Emma", email: "guest@example.com", partySize: 3, visitAt: at(20), occasion: null, visitCount: 2, language: lang, seed: "sample-3" } },
  ];
  return samples.map((s) => {
    const r = renderThankYou(kit, settings, restaurantId, restaurant.timezone, s.facts, now);
    return { label: s.label, subject: r.subject, html: r.html };
  });
}

// ── Visits ───────────────────────────────────────────────────────────────

export type VisitForEmail = {
  id: string;
  restaurantId: string;
  guestName: string;
  guestEmail: string | null;
  language: string | null;
  partySize: number;
  seatedAt: Date;
  occasion: string | null;
  thankYouEmailSentAt: Date | null;
  reservationId: string | null;
  reservation: { customerEmail: string | null; language: string | null; occasion: string | null } | null;
};

/** The address to write to for a visit: what staff typed, else the booking's. */
export function visitEmail(visit: VisitForEmail, override?: string | null): string | null {
  const candidate = (override ?? visit.guestEmail ?? visit.reservation?.customerEmail ?? "").trim().toLowerCase();
  return candidate || null;
}

export async function loadVisit(restaurantId: string, visitId: string): Promise<VisitForEmail | null> {
  const v = await prisma.tableSession.findUnique({
    where: { id: visitId },
    select: {
      id: true, restaurantId: true, guestName: true, guestEmail: true, language: true, partySize: true, seatedAt: true, occasion: true, thankYouEmailSentAt: true, reservationId: true,
      reservation: { select: { customerEmail: true, language: true, occasion: true } },
    },
  });
  return v && v.restaurantId === restaurantId ? v : null;
}

/** How many times this guest (by email) has been here, counting this visit
 *  — but never counting this visit's own booking as a "previous" one. */
export async function visitCountFor(restaurantId: string, email: string, before: Date, excludeReservationId: string | null = null): Promise<number> {
  const [sessions, bookings] = await Promise.all([
    prisma.tableSession.count({ where: { restaurantId, guestEmail: email, seatedAt: { lt: before } } }),
    prisma.reservation.count({
      where: {
        restaurantId,
        customerEmail: email,
        status: { in: ["SEATED", "COMPLETED"] },
        reservationTime: { lt: before },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
    }),
  ]);
  return Math.max(sessions, bookings) + 1;
}

export async function factsForVisit(visit: VisitForEmail, email: string, defaultLanguage: Language): Promise<VisitFacts> {
  return {
    firstName: firstName(visit.guestName),
    email,
    partySize: visit.partySize,
    visitAt: visit.seatedAt,
    occasion: visit.occasion ?? visit.reservation?.occasion ?? null,
    visitCount: await visitCountFor(visit.restaurantId, email, visit.seatedAt, visit.reservationId),
    language: normalizeLanguage(visit.language ?? visit.reservation?.language, defaultLanguage),
    seed: visit.id,
  };
}

export async function renderThankYouForVisit(restaurantId: string, visitId: string, emailOverride?: string | null): Promise<(RenderedThankYou & { to: string }) | null> {
  const visit = await loadVisit(restaurantId, visitId);
  if (!visit) return null;
  const { kit, restaurant, settings } = await loadBrandKit(restaurantId);
  const email = visitEmail(visit, emailOverride) ?? "guest@example.com";
  const facts = await factsForVisit(visit, email, kit.defaultLanguage);
  return { ...renderThankYou(kit, settings, restaurantId, restaurant.timezone, facts), to: email };
}

// ── Sending (dependency-injected so the rules are unit-testable) ─────────

export type ThankYouOutcome =
  | { sent: true; to: string }
  | { sent: false; reason: "OFF" | "PLAN" | "NOT_FOUND" | "NO_EMAIL" | "UNSUBSCRIBED" | "ALREADY_SENT" | "SEND_FAILED"; detail?: string };

export const OUTCOME_TEXT: Record<Exclude<ThankYouOutcome, { sent: true }>["reason"], string> = {
  OFF: "Thank-you emails are switched off in Settings → Brand kit.",
  PLAN: "Thank-you emails are part of the Premium plan.",
  NOT_FOUND: "Visit not found.",
  NO_EMAIL: "No email on file for this guest.",
  UNSUBSCRIBED: "This guest unsubscribed from your emails.",
  ALREADY_SENT: "A thank-you already went to this guest for this visit.",
  SEND_FAILED: "The email couldn't be sent.",
};

export type SendDeps = {
  canSend(restaurantId: string): Promise<{ ok: true } | { ok: false; reason: "OFF" | "PLAN" }>;
  loadVisit(restaurantId: string, visitId: string): Promise<VisitForEmail | null>;
  saveVisitEmail(visitId: string, email: string): Promise<void>;
  isSuppressed(restaurantId: string, email: string): Promise<boolean>;
  /** Marks the visit as emailed if — and only if — it wasn't already. */
  claim(visitId: string): Promise<boolean>;
  unclaim(visitId: string): Promise<void>;
  render(restaurantId: string, visit: VisitForEmail, email: string): Promise<RenderedThankYou>;
  send(restaurantId: string, visit: VisitForEmail, email: string, rendered: RenderedThankYou): Promise<{ ok: boolean; error?: string }>;
};

export async function sendThankYouWithDeps(deps: SendDeps, restaurantId: string, visitId: string, opts: { email?: string | null } = {}): Promise<ThankYouOutcome> {
  const gate = await deps.canSend(restaurantId);
  if (!gate.ok) return { sent: false, reason: gate.reason };

  const visit = await deps.loadVisit(restaurantId, visitId);
  if (!visit) return { sent: false, reason: "NOT_FOUND" };
  if (visit.thankYouEmailSentAt) return { sent: false, reason: "ALREADY_SENT" };

  const email = visitEmail(visit, opts.email);
  if (!email) return { sent: false, reason: "NO_EMAIL" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { sent: false, reason: "NO_EMAIL", detail: "That doesn't look like an email address." };
  if (opts.email && email !== visit.guestEmail) await deps.saveVisitEmail(visitId, email);

  if (await deps.isSuppressed(restaurantId, email)) return { sent: false, reason: "UNSUBSCRIBED" };

  // Claim before sending, so two taps (or a cron overlapping a manual send)
  // can't produce two emails — a duplicate thank-you looks careless in a
  // way a rare missing one doesn't.
  if (!(await deps.claim(visitId))) return { sent: false, reason: "ALREADY_SENT" };

  const rendered = await deps.render(restaurantId, visit, email);
  const result = await deps.send(restaurantId, visit, email, rendered);
  if (!result.ok) {
    await deps.unclaim(visitId);
    return { sent: false, reason: "SEND_FAILED", detail: result.error };
  }
  return { sent: true, to: email };
}

export const prismaSendDeps: SendDeps = {
  async canSend(restaurantId) {
    const settings = await getSettings(restaurantId);
    if (settings.thankYouMode === "OFF") return { ok: false, reason: "OFF" };
    if (!(await hasPremiumFeatures(restaurantId))) return { ok: false, reason: "PLAN" };
    return { ok: true };
  },
  loadVisit,
  async saveVisitEmail(visitId, email) {
    await prisma.tableSession.update({ where: { id: visitId }, data: { guestEmail: email } });
  },
  async isSuppressed(restaurantId, email) {
    return !!(await prisma.emailSuppression.findUnique({ where: { restaurantId_email: { restaurantId, email } } }));
  },
  async claim(visitId) {
    const r = await prisma.tableSession.updateMany({ where: { id: visitId, thankYouEmailSentAt: null }, data: { thankYouEmailSentAt: new Date() } });
    return r.count === 1;
  },
  async unclaim(visitId) {
    await prisma.tableSession.update({ where: { id: visitId }, data: { thankYouEmailSentAt: null } });
  },
  async render(restaurantId, visit, email) {
    const { kit, restaurant, settings } = await loadBrandKit(restaurantId);
    const facts = await factsForVisit(visit, email, kit.defaultLanguage);
    return renderThankYou(kit, settings, restaurantId, restaurant.timezone, facts);
  },
  async send(restaurantId, visit, email, rendered) {
    const { restaurant, settings } = await loadBrandKit(restaurantId);
    return sendEmail({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      ...senderIdentityFor(restaurant, settings),
      meta: { kind: "THANK_YOU", restaurantId, tableSessionId: visit.id },
    });
  },
};

export function sendThankYouForVisit(restaurantId: string, visitId: string, opts: { email?: string | null } = {}): Promise<ThankYouOutcome> {
  return sendThankYouWithDeps(prismaSendDeps, restaurantId, visitId, opts);
}

// ── What to do when a table is released ──────────────────────────────────

export type ThankYouCandidate = { visitId: string; customerName: string; customerEmail: string | null };
export type ReleaseThankYou = { ask: ThankYouCandidate | null; scheduledFor: string | null; sentNow: boolean };

/** When "next morning at 10:00" actually is, in the venue's own time. */
export function nextSendAt(delay: ThankYouDelay, timezone: string, now = new Date()): Date {
  if (delay === "NEXT_MORNING") {
    const today = combineDateAndTime(toLocalDateStr(now, timezone), "10:00", timezone);
    if (today.getTime() > now.getTime()) return today;
    return combineDateAndTime(toLocalDateStr(new Date(now.getTime() + 86400000), timezone), "10:00", timezone);
  }
  return new Date(now.getTime() + THANK_YOU_DELAYS[delay].minutes * 60000);
}

/**
 * Called by releaseTable for the party that just left. ASK → hand the UI a
 * candidate to confirm (also when AUTO but there's no address to send to);
 * AUTO → send now or queue for later; OFF / not Premium / already sent →
 * nothing.
 */
export async function thankYouOnRelease(restaurantId: string, visitId: string): Promise<ReleaseThankYou> {
  const none: ReleaseThankYou = { ask: null, scheduledFor: null, sentNow: false };
  const settings = await getSettings(restaurantId);
  if (settings.thankYouMode === "OFF") return none;
  if (!(await hasPremiumFeatures(restaurantId))) return none;
  const visit = await loadVisit(restaurantId, visitId);
  if (!visit || visit.thankYouEmailSentAt) return none;
  const email = visitEmail(visit);
  const candidate: ThankYouCandidate = { visitId, customerName: visit.guestName, customerEmail: email };

  if (settings.thankYouMode !== "AUTO" || !email) return { ...none, ask: candidate };
  if (await prismaSendDeps.isSuppressed(restaurantId, email)) return none;

  const delay = (settings.thankYouDelay in THANK_YOU_DELAYS ? settings.thankYouDelay : "IMMEDIATE") as ThankYouDelay;
  if (delay === "IMMEDIATE") {
    const outcome = await sendThankYouForVisit(restaurantId, visitId);
    return { ...none, sentNow: outcome.sent };
  }
  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true } });
  const sendAt = nextSendAt(delay, restaurant.timezone);
  await prisma.scheduledEmail.upsert({
    where: { tableSessionId: visitId },
    create: { restaurantId, tableSessionId: visitId, sendAt },
    update: { sendAt, status: "PENDING", attempts: 0, lastError: null },
  });
  return { ...none, scheduledFor: sendAt.toISOString() };
}

/** Drains the queue: everything due, oldest first. Run by the cron. */
export async function processScheduledEmails(limit = 50): Promise<{ processed: number; sent: number }> {
  const due = await prisma.scheduledEmail.findMany({
    where: { status: "PENDING", sendAt: { lte: new Date() } },
    orderBy: { sendAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const job of due) {
    // Take the row before working on it, so two overlapping cron runs can't both send.
    const taken = await prisma.scheduledEmail.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (taken.count === 0) continue;
    try {
      const outcome = await sendThankYouForVisit(job.restaurantId, job.tableSessionId);
      if (outcome.sent) sent++;
      const retry = !outcome.sent && outcome.reason === "SEND_FAILED" && job.attempts + 1 < 3;
      await prisma.scheduledEmail.update({
        where: { id: job.id },
        data: {
          status: outcome.sent ? "SENT" : retry ? "PENDING" : outcome.reason === "SEND_FAILED" ? "FAILED" : "SKIPPED",
          lastError: outcome.sent ? null : `${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ""}`,
          processedAt: new Date(),
          ...(retry ? { sendAt: new Date(Date.now() + 10 * 60000) } : {}),
        },
      });
    } catch (err) {
      await prisma.scheduledEmail.update({ where: { id: job.id }, data: { status: job.attempts + 1 < 3 ? "PENDING" : "FAILED", lastError: String(err).slice(0, 500), sendAt: new Date(Date.now() + 10 * 60000) } });
    }
  }
  return { processed: due.length, sent };
}

// ── Analytics ────────────────────────────────────────────────────────────

export async function emailStatsForMonth(restaurantId: string, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await prisma.emailLog.findMany({
    where: { restaurantId, kind: "THANK_YOU", createdAt: { gte: monthStart } },
    select: { status: true, openedAt: true, clickedAt: true },
  });
  const sent = rows.filter((r) => r.status !== "FAILED" && r.status !== "SKIPPED").length;
  const opened = rows.filter((r) => r.openedAt).length;
  const clicked = rows.filter((r) => r.clickedAt).length;
  const bounced = rows.filter((r) => r.status === "BOUNCED").length;
  return { sent, opened, clicked, bounced, openRate: sent ? Math.round((opened / sent) * 100) : 0 };
}
