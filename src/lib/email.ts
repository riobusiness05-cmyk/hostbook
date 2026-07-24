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
