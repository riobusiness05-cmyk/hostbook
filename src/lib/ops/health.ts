import { prisma } from "@/lib/prisma";

/**
 * Is Host Flow able to serve a booking right now? One cheap database
 * round-trip with a hard timeout. Used by /api/health (for an external
 * uptime monitor) and by the health-check cron (which emails an alert).
 */
export type HealthReport = { ok: boolean; db: { ok: boolean; ms: number; error?: string }; checkedAt: string };

export async function checkHealth(timeoutMs = 5000): Promise<HealthReport> {
  const started = Date.now();
  const db = await Promise.race([
    prisma.$queryRaw`SELECT 1`.then(() => ({ ok: true as const })).catch((e: unknown) => ({ ok: false as const, error: (e as Error).message?.slice(0, 200) })),
    new Promise<{ ok: false; error: string }>((resolve) => setTimeout(() => resolve({ ok: false, error: `No reply from the database within ${timeoutMs} ms` }), timeoutMs)),
  ]);
  const ms = Date.now() - started;
  return { ok: db.ok, db: { ...db, ms }, checkedAt: new Date().toISOString() };
}

/**
 * Alert email sent WITHOUT touching the database (which may be the thing
 * that's down) — straight to Resend's API. Recipient: PLATFORM_ALERT_EMAIL,
 * else ADMIN_EMAIL.
 */
export async function sendOpsAlert(subject: string, lines: string[]): Promise<{ ok: boolean; error?: string }> {
  const to = process.env.PLATFORM_ALERT_EMAIL || process.env.ADMIN_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "alerts@hostflow.space";
  if (!to) return { ok: false, error: "No PLATFORM_ALERT_EMAIL / ADMIN_EMAIL set" };
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };
  const text = lines.join("\n");
  const html = `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Host Flow alerts <${from}>`, to, subject, text, html }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
