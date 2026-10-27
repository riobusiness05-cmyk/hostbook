import { prisma } from "@/lib/prisma";
import { sendEmail, restaurantEmailLayout } from "@/lib/email";
import { senderIdentityFor, normalizeLanguage } from "@/lib/hostflow/guestEmails";
import { getSettings } from "@/lib/hostflow/floor";
import { toLocalDateStr, toLocalTimeStr } from "@/lib/availability";
import { readableOn } from "@/lib/brandKit";
import { appUrl } from "@/lib/stripe";

/**
 * Day-before reminders. An hourly cron sends one reminder to every booking
 * that is 20–28 hours away, has an email, hasn't been reminded, and whose
 * venue has reminders on. The email carries two one-tap links: "Yes, I'm
 * coming" (sets guestConfirmedAt, shown to staff as Confirmed) and the
 * manage page to move or cancel. Bookings made less than ~20 h ahead get no
 * reminder — they just booked.
 */

export function reminderWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() + 20 * 3600_000), to: new Date(now.getTime() + 28 * 3600_000) };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function reminderCopy(lang: "en" | "es", p: { firstName: string; venue: string; date: string; time: string; partySize: number }) {
  if (lang === "es") {
    return {
      subject: `Tu mesa en ${p.venue} es mañana a las ${p.time}`,
      heading: `Hasta mañana, ${p.firstName}`,
      intro: `Te recordamos tu reserva en ${p.venue}:`,
      ask: `¿Nos confirmas que venís? Un toque y listo. Si tus planes han cambiado, puedes cambiar o cancelar la reserva con el otro botón — así la mesa queda libre para otra persona.`,
      confirm: "Sí, vamos",
      change: "Cambiar o cancelar",
      labels: { date: "Fecha", time: "Hora", party: "Personas" },
      preview: `Mañana a las ${p.time}, mesa para ${p.partySize} en ${p.venue}.`,
    };
  }
  return {
    subject: `Your table at ${p.venue} is tomorrow at ${p.time}`,
    heading: `See you tomorrow, ${p.firstName}`,
    intro: `A quick reminder of your booking at ${p.venue}:`,
    ask: `Could you confirm you're coming? One tap does it. If your plans have changed, the other button lets you move or cancel — it frees the table for someone else.`,
    confirm: "Yes, we're coming",
    change: "Change or cancel",
    labels: { date: "Date", time: "Time", party: "Party" },
    preview: `Tomorrow at ${p.time}, table for ${p.partySize} at ${p.venue}.`,
  };
}

export function reminderHtml(p: {
  lang: "en" | "es"; venue: string; brandColor: string; address: string | null; firstName: string; date: string; time: string; partySize: number;
  confirmUrl: string; manageUrl: string;
}): { subject: string; html: string; text: string } {
  const c = reminderCopy(p.lang, p);
  const accent = readableOn(p.brandColor);
  const btn = (url: string, label: string, primary: boolean) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 10px auto;"><tr><td style="border-radius:8px;background:${primary ? accent : "#ffffff"};border:1px solid ${accent};">
      <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:${primary ? "#ffffff" : accent};text-decoration:none;">${esc(label)}</a></td></tr></table>`;
  const body =
    `<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#111827;">${esc(c.heading)}</h1>` +
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">${esc(c.intro)}</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;font-size:15px;color:#111827;">
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280;">${c.labels.date}</td><td style="padding:4px 0;font-weight:600;">${esc(p.date)}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280;">${c.labels.time}</td><td style="padding:4px 0;font-weight:600;">${esc(p.time)}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280;">${c.labels.party}</td><td style="padding:4px 0;font-weight:600;">${p.partySize}</td></tr>
    </table>` +
    `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">${esc(c.ask)}</p>` +
    `<div style="text-align:center;">${btn(p.confirmUrl, c.confirm, true)}${btn(p.manageUrl, c.change, false)}</div>` +
    `<p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">${p.lang === "es" ? "Si los botones no funcionan:" : "If the buttons don't work:"} <a href="${p.confirmUrl}" style="color:#6b7280;">${p.confirmUrl}</a></p>`;
  const html = restaurantEmailLayout({ restaurantName: p.venue, brandColor: p.brandColor, address: p.address, previewText: c.preview, bodyHtml: body });
  const text = [c.heading, "", c.intro, `${c.labels.date}: ${p.date}`, `${c.labels.time}: ${p.time}`, `${c.labels.party}: ${p.partySize}`, "", c.ask, "", `${c.confirm}: ${p.confirmUrl}`, `${c.change}: ${p.manageUrl}`].join("\n");
  return { subject: c.subject, html, text };
}

export type ReminderRun = { considered: number; sent: number; skipped: number; failed: number };

export async function sendDueReminders(now = new Date()): Promise<ReminderRun> {
  const { from, to } = reminderWindow(now);
  const due = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      customerEmail: { not: null },
      reservationTime: { gte: from, lte: to },
    },
    include: { restaurant: true },
    take: 200,
  });
  const run: ReminderRun = { considered: due.length, sent: 0, skipped: 0, failed: 0 };
  const settingsCache = new Map<string, Awaited<ReturnType<typeof getSettings>>>();

  for (const r of due) {
    const email = r.customerEmail!.trim().toLowerCase();
    let settings = settingsCache.get(r.restaurantId);
    if (!settings) { settings = await getSettings(r.restaurantId); settingsCache.set(r.restaurantId, settings); }
    if (!settings.reminderEmailsEnabled) { run.skipped++; continue; }
    const suppressed = await prisma.emailSuppression.findUnique({ where: { restaurantId_email: { restaurantId: r.restaurantId, email } } });
    if (suppressed) { run.skipped++; continue; }

    // Claim first so two overlapping cron runs can't both send.
    const claimed = await prisma.reservation.updateMany({ where: { id: r.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0) { run.skipped++; continue; }

    const venue = settings.emailFromName?.trim() || r.restaurant.name;
    const lang = normalizeLanguage(r.language, normalizeLanguage(settings.defaultLanguage, "en"));
    const base = appUrl();
    const manageUrl = `${base}/manage/${r.id}?t=${r.manageToken}`;
    const confirmUrl = `${manageUrl}&confirm=1`;
    const msg = reminderHtml({
      lang,
      venue,
      brandColor: r.restaurant.brandColor,
      address: r.restaurant.address,
      firstName: r.customerName.trim().split(/\s+/)[0] || r.customerName,
      date: toLocalDateStr(r.reservationTime, r.restaurant.timezone),
      time: toLocalTimeStr(r.reservationTime, r.restaurant.timezone),
      partySize: r.partySize,
      confirmUrl,
      manageUrl,
    });
    try {
      const result = await sendEmail({
        to: email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...senderIdentityFor(r.restaurant, settings),
        meta: { kind: "BOOKING_REMINDER", restaurantId: r.restaurantId },
      });
      if (result.ok) run.sent++;
      else { run.failed++; console.error("[reminders] send failed", r.id, result.error); }
    } catch (err) {
      run.failed++;
      console.error("[reminders] send threw", r.id, err);
    }
  }
  return run;
}
