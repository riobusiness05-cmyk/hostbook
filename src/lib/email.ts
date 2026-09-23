import { prisma } from "@/lib/prisma";
import { FONT_STYLES, contrastText, readableOn, type BrandKit, type Language } from "@/lib/brandKit";

/**
 * Transactional email sender + templates. If RESEND_API_KEY is set, sends via
 * Resend's HTTP API (no SDK dependency needed — it's a single POST). If not,
 * logs the email to the console instead of failing — the same
 * "not configured yet" degrade used for ANTHROPIC_API_KEY (src/lib/claude.ts)
 * and STRIPE_SECRET_KEY (src/lib/stripe.ts), so every flow below stays fully
 * testable locally before a real email provider is wired up.
 *
 * All templates share `emailLayout`/`emailButton` below rather than each
 * hand-rolling their own HTML shell — the "reusable component" for a
 * dependency-free HTML-string email (no react-email/JSX here, matching this
 * project's zero-extra-dependency style) is a shared builder function, not a
 * component tree.
 */
export type EmailKind =
  | "SIGNUP_VERIFY"
  | "PASSWORD_RESET"
  | "LOGIN_ALERT"
  | "BOOKING_CONFIRMATION"
  | "OWNER_NEW_BOOKING"
  | "THANK_YOU"
  | "THANK_YOU_TEST"
  | "PAYMENT_FAILED"
  | "PAYMENT_REQUIRED";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  // Guest-facing mail from a restaurant goes out in the restaurant's own
  // name and at its own address on our verified sending domain (see
  // senderIdentityFor in hostflow/guestEmails.ts), with replies landing in
  // the restaurant's inbox — not ours. Omitted = Host Flow's own identity.
  from?: { name: string; address: string };
  replyTo?: string;
  // What this email is and which venue it belongs to, for the email log.
  meta?: { kind: EmailKind; restaurantId?: string | null; tableSessionId?: string | null };
  // Plain-text alternative and extra headers (List-Unsubscribe) for guest mail.
  text?: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = params.from ? `${params.from.name.replace(/[<>"\r\n]/g, "").trim()} <${params.from.address}>` : defaultSender();

  // The log is how a host answers "did that email go?" — it must never be
  // the reason an email doesn't go, so a logging failure is swallowed.
  const record = async (status: "SENT" | "FAILED" | "SKIPPED", extra: { error?: string; providerId?: string } = {}) => {
    try {
      await prisma.emailLog.create({
        data: {
          restaurantId: params.meta?.restaurantId ?? null,
          kind: params.meta?.kind ?? "OTHER",
          tableSessionId: params.meta?.tableSessionId ?? null,
          to: params.to,
          subject: params.subject,
          status,
          error: extra.error ?? null,
          providerId: extra.providerId ?? null,
        },
      });
    } catch (err) {
      console.error("[email:log] could not record email", err);
    }
  };

  if (!apiKey) {
    console.log(
      `[email:not-configured] Would send to ${params.to} from ${from}${params.replyTo ? ` (reply-to ${params.replyTo})` : ""}: "${params.subject}"\n${params.html}`
    );
    await record("SKIPPED", { error: "RESEND_API_KEY is not set — email only logged, not sent" });
    return { ok: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
        ...(params.headers ? { headers: params.headers } : {}),
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `${res.status} ${body}`;
      console.error(`[email:resend-error] ${error}`);
      await record("FAILED", { error: error.slice(0, 1000) });
      return { ok: false, error };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    await record("SENT", { providerId: data?.id });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email:resend-error] request failed: ${error}`);
    await record("FAILED", { error: `request failed: ${error}`.slice(0, 1000) });
    return { ok: false, error };
  }
}

/** Host Flow's own sender, e.g. "Host Flow <reservations@hostflow.space>".
 *  The fallback matches production's verified Resend domain — a sender on
 *  an unverified domain is rejected by Resend outright. */
function defaultSender(): string {
  return process.env.RESEND_FROM_EMAIL || "Host Flow <reservations@hostflow.space>";
}

/** The domain every restaurant's own sender address lives on — whatever
 *  domain the platform sender uses, since that's the one verified with
 *  Resend. Restaurants get <slug>@this. */
export function sendingDomain(): string {
  const address = defaultSender().match(/<([^>]+)>/)?.[1] ?? defaultSender();
  return address.split("@")[1] ?? "hostflow.space";
}

// ── Shared layout ────────────────────────────────────────────────────────
// Inline styles throughout (email clients strip/ignore most <style> rules,
// especially Outlook) — the <style> block below is only for the mobile
// breakpoint and dark-mode-safe color-scheme hint, both of which degrade
// harmlessly to the inline fallbacks if a client ignores them.

const INK = "#1a1a1a";
const INK_MUTED = "#5b5b5b";
const BORDER = "#e8e4dd";
const CARD_BG = "#ffffff";
const PAGE_BG = "#f6f4f0";
const ACCENT_BLUE = "#2b5cff";
const ACCENT_BUTTON = "#e17f3c";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function emailLayout(params: { previewText: string; bodyHtml: string; footerNote?: string }): string {
  const { previewText, bodyHtml, footerNote } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>Host Flow</title>
<style>
  @media (max-width: 600px) {
    .hf-container { width: 100% !important; }
    .hf-card { padding: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:${PAGE_BG}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="hf-container" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%;">
          <tr>
            <td style="padding:0 4px 20px 4px;">
              <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:18px; font-weight:700; color:${INK};">host</span><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:18px; font-weight:700; color:${ACCENT_BLUE};">flow</span>
            </td>
          </tr>
          <tr>
            <td class="hf-card" style="background:${CARD_BG}; border:1px solid ${BORDER}; border-radius:12px; padding:32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0 4px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#9a9690; text-align:center;">
              ${footerNote ? `${escapeHtml(footerNote)}<br/>` : ""}
              Host Flow — the operating system for your floor
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="border-radius:8px; background:${ACCENT_BUTTON};">
        <a href="${url}" style="display:inline-block; padding:12px 24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 12px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:21px; font-weight:700; color:${INK};">${escapeHtml(text)}</h1>`;
}

function emailParagraph(html: string): string {
  return `<p style="margin:0 0 12px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:${INK_MUTED};">${html}</p>`;
}

function emailFallbackLink(url: string): string {
  return `<p style="margin:16px 0 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; color:#9a9690; word-break:break-all;">Or paste this link into your browser: ${url}</p>`;
}

function emailDetailsTable(rows: [string, string][]): string {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#9a9690;">${escapeHtml(label)}</td><td style="padding:6px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:${INK}; text-align:right;">${escapeHtml(value)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; border-top:1px solid ${BORDER}; border-bottom:1px solid ${BORDER};">${rowsHtml}</table>`;
}

// ── Templates ────────────────────────────────────────────────────────────

/** Signup welcome + email verification, sent as a single email (see reservationActions.ts / register/route.ts callers — merged intentionally so a new owner isn't hit with two emails seconds apart). */
export function verificationEmailHtml(verifyUrl: string, restaurantName: string): string {
  const body =
    emailHeading(`Welcome to Host Flow, ${escapeHtml(restaurantName)}!`) +
    emailParagraph(
      "You're all set up — your floor, bookings, and guest list are ready whenever you are. Just confirm your email to finish securing your account."
    ) +
    emailButton(verifyUrl, "Verify email") +
    emailFallbackLink(verifyUrl);
  return emailLayout({ previewText: `Welcome to Host Flow, ${restaurantName} — confirm your email to finish setup.`, bodyHtml: body });
}

export function passwordResetEmailHtml(resetUrl: string, ownerName: string): string {
  const body =
    emailHeading("Reset your Host Flow password") +
    emailParagraph(`Hi ${escapeHtml(ownerName)}, we got a request to reset your password. This link expires in 1 hour.`) +
    emailButton(resetUrl, "Reset password") +
    emailFallbackLink(resetUrl) +
    emailParagraph("If you didn't request this, you can safely ignore this email — your password won't change.");
  return emailLayout({ previewText: "Reset your Host Flow password — this link expires in 1 hour.", bodyHtml: body });
}

export function reservationConfirmationHtml(params: {
  restaurantName: string;
  brandColor: string;
  address: string | null;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
  manageUrl: string;
}): string {
  const { restaurantName, customerName, date, time, partySize, manageUrl } = params;
  const accent = readableOn(params.brandColor);
  const body =
    emailHeading(`You're booked, ${escapeHtml(customerName.trim().split(/\s+/)[0] || customerName)}`) +
    emailParagraph(`Your table at ${escapeHtml(restaurantName)} is confirmed:`) +
    emailDetailsTable([
      ["Date", date],
      ["Time", time],
      ["Party size", String(partySize)],
    ]) +
    brandButton(manageUrl, "View or change your booking", accent) +
    emailParagraph(`Need to cancel or move it? The link above does both. We look forward to seeing you.`) +
    emailFallbackLink(manageUrl);
  return restaurantEmailLayout({
    restaurantName,
    brandColor: params.brandColor,
    address: params.address,
    previewText: `You're booked at ${restaurantName} — ${date} at ${time}.`,
    bodyHtml: body,
  });
}

/** Sent to an account when it signs in from an IP it hasn't used before. */
export function loginAlertEmailHtml(params: {
  accountName: string;
  restaurantName: string;
  ip: string;
  whenLabel: string;
  resetPasswordUrl: string;
}): string {
  const { accountName, restaurantName, ip, whenLabel, resetPasswordUrl } = params;
  const body =
    emailHeading("New sign-in to your account") +
    emailParagraph(
      `Hi ${escapeHtml(accountName)}, we noticed a sign-in to your ${escapeHtml(restaurantName)} Host Flow account from a new location.`
    ) +
    emailDetailsTable([
      ["When", whenLabel],
      ["IP address", ip],
    ]) +
    emailParagraph("If this was you, no action is needed.") +
    emailParagraph(
      "<strong>If this wasn't you</strong>, reset your password right away to secure your account:"
    ) +
    emailButton(resetPasswordUrl, "Reset password") +
    emailFallbackLink(resetPasswordUrl);
  return emailLayout({
    previewText: `New sign-in to your Host Flow account from ${ip}.`,
    bodyHtml: body,
    footerNote: "You're receiving this because sign-in alerts are on for new locations.",
  });
}

/** Sent to the restaurant owner when a guest books through the widget/chat (not for bookings the owner made themselves from the dashboard). */
export function ownerBookingNotificationHtml(params: {
  restaurantName: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
  tableLabel: string;
  dashboardUrl: string;
}): string {
  const { restaurantName, customerName, date, time, partySize, tableLabel, dashboardUrl } = params;
  const body =
    emailHeading("New booking") +
    emailParagraph(`${escapeHtml(customerName)} just booked a table at ${escapeHtml(restaurantName)}.`) +
    emailDetailsTable([
      ["Guest", customerName],
      ["Date", date],
      ["Time", time],
      ["Party size", String(partySize)],
      ["Table", tableLabel],
    ]) +
    emailButton(dashboardUrl, "View on your floor") +
    emailFallbackLink(dashboardUrl);
  return emailLayout({ previewText: `New booking: ${customerName}, party of ${partySize}, ${date} at ${time}.`, bodyHtml: body });
}

/** Sent to the restaurant owner when their Host Flow subscription payment fails. */
export function paymentFailedEmailHtml(params: { restaurantName: string; portalUrl: string }): string {
  const { restaurantName, portalUrl } = params;
  const body =
    emailHeading("We couldn't process your payment") +
    emailParagraph(
      `Hi, we tried to charge the card on file for ${escapeHtml(restaurantName)}'s Host Flow subscription and the payment didn't go through.`
    ) +
    emailParagraph(
      "This usually means the card expired, was declined, or has insufficient funds. Update your payment method to keep your account in good standing — nothing changes on your floor in the meantime, but repeated failures can eventually pause billing-dependent features."
    ) +
    emailButton(portalUrl, "Update payment method") +
    emailFallbackLink(portalUrl);
  return emailLayout({ previewText: `Payment failed for ${restaurantName}'s Host Flow subscription — update your card to fix it.`, bodyHtml: body });
}

/** Sent to the restaurant owner a couple of days before their trial ends, or when payment is otherwise needed to continue. */
export function paymentRequiredEmailHtml(params: { restaurantName: string; checkoutUrl: string; daysLeft: number }): string {
  const { restaurantName, checkoutUrl, daysLeft } = params;
  const dayWord = daysLeft === 1 ? "day" : "days";
  const body =
    emailHeading(`Your trial ends in ${daysLeft} ${dayWord}`) +
    emailParagraph(
      `Hi, ${escapeHtml(restaurantName)}'s free trial of Host Flow wraps up in ${daysLeft} ${dayWord}. Add a payment method now so your floor plan, reservations, and bookings keep running without interruption.`
    ) +
    emailButton(checkoutUrl, "Complete payment") +
    emailFallbackLink(checkoutUrl);
  return emailLayout({ previewText: `${restaurantName}'s Host Flow trial ends in ${daysLeft} ${dayWord} — add a payment method to continue.`, bodyHtml: body });
}

// ── Restaurant-branded guest email ───────────────────────────────────────
// Unlike the templates above (Host Flow writing to a restaurant), these are
// a restaurant writing to its own guest: the restaurant's colour and logo
// head the email, its name and address sign it off, and Host Flow appears
// nowhere. Kept dependency-free and inline-styled like the rest.

/** Swaps {name} / {restaurant} in a host-written subject or message. */
export function fillThankYouTemplate(text: string, vars: { name: string; restaurant: string }): string {
  return text.replace(/\{name\}/gi, vars.name).replace(/\{restaurant\}/gi, vars.restaurant);
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function brandButton(url: string, label: string, accent: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 6px auto;">
    <tr>
      <td style="border-radius:8px; background:${accent};">
        <a href="${escapeHtml(url)}" style="display:inline-block; padding:13px 26px; font-family:${FONT}; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function restaurantEmailLayout(params: {
  restaurantName: string;
  brandColor: string;
  address: string | null;
  previewText: string;
  bodyHtml: string;
}): string {
  const { restaurantName, address, previewText, bodyHtml } = params;
  const accent = readableOn(params.brandColor);
  const header = `<span style="font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; letter-spacing:0.02em; color:#ffffff;">${escapeHtml(restaurantName)}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(restaurantName)}</title>
<style>
  @media (max-width: 600px) {
    .hf-container { width: 100% !important; }
    .hf-card { padding: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:${PAGE_BG}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="hf-container" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; border-radius:14px; overflow:hidden; border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${accent}; padding:28px 32px;">
              ${header}
            </td>
          </tr>
          <tr>
            <td class="hf-card" style="background:${CARD_BG}; padding:32px; font-family:${FONT};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:${CARD_BG}; border-top:1px solid ${BORDER}; padding:16px 32px; font-family:${FONT}; font-size:12px; line-height:1.6; color:#9a9690; text-align:center;">
              <strong style="color:${INK_MUTED};">${escapeHtml(restaurantName)}</strong>${address ? `<br/>${escapeHtml(address)}` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── The post-visit thank-you, brand-kit edition ──────────────────────────
// Editorial, not a marketing blast: logo, one hero photo, a short personal
// note, one button, a soft invitation back, a quiet footer. Table layout
// with inline styles for Gmail/Outlook; a dark-mode block that keeps the
// card readable when the client inverts backgrounds; a plain-text twin.

const T = {
  en: { review: "Leave us a Google review", takes: "It takes about a minute.", back: "Whenever you'd like to come back, your table is a tap away:", book: "Book a table", unsubscribe: "Unsubscribe from these emails", follow: "Instagram", site: "Website" },
  es: { review: "Déjanos una reseña en Google", takes: "Lleva alrededor de un minuto.", back: "Cuando quieras volver, tu mesa está a un toque:", book: "Reservar mesa", unsubscribe: "Darse de baja de estos correos", follow: "Instagram", site: "Web" },
} as const;

export function guestThankYouEmail(
  kit: BrandKit,
  params: { subject: string; paragraphs: string[]; signOff: string; unsubscribeUrl: string; language: Language }
): { html: string; text: string } {
  const t = T[params.language === "es" ? "es" : "en"];
  const font = FONT_STYLES[kit.font];
  const accent = readableOn(kit.primary);
  const buttonInk = contrastText(accent);
  const bg = "#f6f4f0";
  const ink = "#1a1a1a";
  const muted = "#6b6560";
  const faint = "#9a9490";
  const card = "#ffffff";

  const body = params.paragraphs
    .map(
      (p, i) =>
        `<p class="hf-ink" style="margin:0 0 ${i === 0 ? 18 : 16}px 0; font-family:${font.body}; font-size:16px; line-height:1.75; color:${ink};">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`
    )
    .join("");

  const review = kit.reviewUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto 8px auto;">
        <tr><td style="border-radius:6px; background:${accent};">
          <a href="${escapeHtml(kit.reviewUrl)}" style="display:inline-block; padding:14px 30px; font-family:${font.body}; font-size:15px; font-weight:700; letter-spacing:0.02em; color:${buttonInk}; text-decoration:none; border-radius:6px;">${t.review}</a>
        </td></tr>
      </table>
      <p style="margin:0; font-family:${font.body}; font-size:12px; color:${faint}; text-align:center;">${t.takes}</p>`
    : "";

  const footerLinks = [
    kit.instagramUrl ? `<a href="${escapeHtml(kit.instagramUrl)}" style="color:${muted}; text-decoration:underline;">${t.follow}</a>` : "",
    kit.websiteUrl ? `<a href="${escapeHtml(kit.websiteUrl)}" style="color:${muted}; text-decoration:underline;">${t.site}</a>` : "",
    kit.phone ? `<a href="tel:${escapeHtml(kit.phone.replace(/\s+/g, ""))}" style="color:${muted}; text-decoration:none;">${escapeHtml(kit.phone)}</a>` : "",
  ].filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="${params.language}" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(params.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (max-width: 620px) { .hf-w { width: 100% !important; } .hf-pad { padding: 30px 24px !important; } }
  @media (prefers-color-scheme: dark) {
    .hf-page { background: #121110 !important; }
    .hf-card { background: #1c1a18 !important; }
    .hf-ink { color: #f1ede6 !important; }
    .hf-muted { color: #b3aca4 !important; }
    .hf-line { border-color: #2d2a26 !important; }
  }
  [data-ogsc] .hf-page { background: #121110 !important; }
  [data-ogsc] .hf-card { background: #1c1a18 !important; }
  [data-ogsc] .hf-ink { color: #f1ede6 !important; }
  [data-ogsc] .hf-muted { color: #b3aca4 !important; }
</style>
</head>
<body class="hf-page" style="margin:0; padding:0; background:${bg}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(params.paragraphs[1] ?? params.subject)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="hf-page" style="background:${bg};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" class="hf-w" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%;">
        <tr><td class="hf-card" style="background:${card}; border-radius:10px; border-top:4px solid ${accent};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:38px 48px 8px 48px;">
              <span style="font-family:${font.heading}; font-size:30px; line-height:1.2; letter-spacing:0.01em; color:${accent};">${escapeHtml(kit.venueName)}</span>
            </td></tr>
            <tr><td class="hf-pad" style="padding:26px 48px 36px 48px;">
              ${body}
              <p class="hf-ink" style="margin:22px 0 0 0; font-family:${font.body}; font-size:16px; line-height:1.75; color:${ink};">${escapeHtml(params.signOff)}</p>
              ${review}
            </td></tr>
            <tr><td class="hf-line" style="padding:22px 48px 30px 48px; border-top:1px solid #eee9e2;">
              <p class="hf-muted" style="margin:0 0 10px 0; font-family:${font.body}; font-size:13px; line-height:1.6; color:${muted};">${t.back}</p>
              <a href="${escapeHtml(kit.bookingUrl)}" style="font-family:${font.body}; font-size:14px; font-weight:700; color:${accent}; text-decoration:none;">${t.book} &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:26px 12px 0 12px; font-family:${font.body}; font-size:12px; line-height:1.7; color:${faint};">
          <span class="hf-muted" style="color:${muted}; font-weight:700;">${escapeHtml(kit.venueName)}</span>${kit.address ? `<br/>${escapeHtml(kit.address)}` : ""}
          ${footerLinks.length ? `<br/>${footerLinks.join(" &nbsp;·&nbsp; ")}` : ""}
          <br/><a href="${escapeHtml(params.unsubscribeUrl)}" style="color:${faint}; text-decoration:underline;">${t.unsubscribe}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    ...params.paragraphs,
    params.signOff,
    "",
    ...(kit.reviewUrl ? [`${t.review}: ${kit.reviewUrl}`, ""] : []),
    `${t.book}: ${kit.bookingUrl}`,
    "",
    kit.venueName,
    ...(kit.address ? [kit.address] : []),
    ...(kit.phone ? [kit.phone] : []),
    "",
    `${t.unsubscribe}: ${params.unsubscribeUrl}`,
  ].join("\n");

  return { html, text };
}
