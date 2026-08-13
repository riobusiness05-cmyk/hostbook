/**
 * Minimal transactional email sender. If RESEND_API_KEY is set, sends via
 * Resend's HTTP API (no SDK dependency needed — it's a single POST). If not,
 * logs the email to the console instead of failing — the same
 * "not configured yet" degrade used for ANTHROPIC_API_KEY (src/lib/claude.ts)
 * and STRIPE_SECRET_KEY (src/lib/stripe.ts), so registration/verification
 * stays fully testable locally before a real email provider is wired up.
 */
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Host Flow <onboarding@hostflow.app>";

  if (!apiKey) {
    console.log(`[email:not-configured] Would send to ${params.to}: "${params.subject}"\n${params.html}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[email:resend-error] ${res.status} ${body}`);
  }
}

export function verificationEmailHtml(verifyUrl: string, restaurantName: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Welcome to Host Flow, ${restaurantName}!</h2>
      <p>Confirm your email to finish setting up your account.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Verify email</a></p>
      <p style="color:#666;font-size:12px;">Or paste this link into your browser: ${verifyUrl}</p>
    </div>
  `;
}

export function passwordResetEmailHtml(resetUrl: string, ownerName: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your Host Flow password</h2>
      <p>Hi ${ownerName}, we got a request to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>
      <p style="color:#666;font-size:12px;">Or paste this link into your browser: ${resetUrl}</p>
      <p style="color:#666;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}

export function reservationConfirmationHtml(params: {
  restaurantName: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
  manageUrl: string;
}): string {
  const { restaurantName, customerName, date, time, partySize, manageUrl } = params;
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You're booked at ${restaurantName}</h2>
      <p>Hi ${customerName}, your table is confirmed:</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:4px 0; color:#666;">Date</td><td style="padding:4px 0; font-weight:600;">${date}</td></tr>
        <tr><td style="padding:4px 0; color:#666;">Time</td><td style="padding:4px 0; font-weight:600;">${time}</td></tr>
        <tr><td style="padding:4px 0; color:#666;">Party size</td><td style="padding:4px 0; font-weight:600;">${partySize}</td></tr>
      </table>
      <p><a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">View or cancel your booking</a></p>
      <p style="color:#666;font-size:12px;">Or paste this link into your browser: ${manageUrl}</p>
    </div>
  `;
}
