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
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = params.from ? `${params.from.name.replace(/[<>"\r\n]/g, "").trim()} <${params.from.address}>` : defaultSender();

  if (!apiKey) {
    console.log(
      `[email:not-configured] Would send to ${params.to} from ${from}${params.replyTo ? ` (reply-to ${params.replyTo})` : ""}: "${params.subject}"\n${params.html}`
    );
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
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `${res.status} ${body}`;
      console.error(`[email:resend-error] ${error}`);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email:resend-error] request failed: ${error}`);
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
  logoUrl: string | null;
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
    logoUrl: params.logoUrl,
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

/** Darkens a hex colour enough for white text to stay legible on it. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#c9611f";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance < 0.6) return `#${m[1]}`;
  const dim = (c: number) => Math.round(c * 0.6).toString(16).padStart(2, "0");
  return `#${dim(r)}${dim(g)}${dim(b)}`;
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
  logoUrl: string | null;
  address: string | null;
  previewText: string;
  bodyHtml: string;
}): string {
  const { restaurantName, logoUrl, address, previewText, bodyHtml } = params;
  const accent = readableOn(params.brandColor);
  const header = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(restaurantName)}" style="display:block; max-height:64px; max-width:220px; margin:0 auto;" />`
    : `<span style="font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; letter-spacing:0.02em; color:#ffffff;">${escapeHtml(restaurantName)}</span>`;

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

export function thankYouEmailHtml(params: {
  restaurantName: string;
  brandColor: string;
  logoUrl: string | null;
  address: string | null;
  customerName: string;
  subject: string;
  message: string;
  reviewUrl: string | null;
}): string {
  const { restaurantName, customerName, subject, message, reviewUrl } = params;
  const accent = readableOn(params.brandColor);
  const vars = { name: customerName, restaurant: restaurantName };
  const paragraphs = fillThankYouTemplate(message, vars)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0; font-family:${FONT}; font-size:15px; line-height:1.65; color:${INK_MUTED};">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`
    )
    .join("");
  const reviewBlock = reviewUrl
    ? brandButton(reviewUrl, "Leave us a Google review", accent) +
      `<p style="margin:0; font-family:${FONT}; font-size:12px; color:#9a9690; text-align:center;">It takes about a minute.</p>`
    : "";
  return restaurantEmailLayout({
    restaurantName,
    brandColor: params.brandColor,
    logoUrl: params.logoUrl,
    address: params.address,
    previewText: fillThankYouTemplate(subject, vars),
    bodyHtml: paragraphs + reviewBlock,
  });
}
