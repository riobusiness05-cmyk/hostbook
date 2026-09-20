import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Resend tells us what happened to each email after we handed it over —
// delivered, bounced, marked as spam, opened — and we write that onto the
// EmailLog row, so Settings → Emails answers "did the guest actually get it?"
// rather than just "did Resend accept it?". Public endpoint: the Svix
// signature (RESEND_WEBHOOK_SECRET) is what proves a call came from Resend.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Later events never downgrade earlier, more definitive ones — a stray
// "delivered" arriving after a bounce must not turn the bounce green.
const RANK: Record<string, number> = { SENT: 0, DELAYED: 1, DELIVERED: 2, OPENED: 3, BOUNCED: 4, COMPLAINED: 4 };

const STATUS_FOR_EVENT: Record<string, string> = {
  "email.delivery_delayed": "DELAYED",
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

function verifySvix(secret: string, id: string, timestamp: string, signature: string, body: string): boolean {
  // Standard Webhooks / Svix: HMAC-SHA256 over "id.timestamp.body" with the
  // base64 secret (after the "whsec_" prefix); header carries one or more
  // "v1,<base64>" entries. Reject anything older than 5 minutes.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not set" }, { status: 503 });

  const body = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";
  if (!verifySvix(secret, id, timestamp, signature, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; bounce?: { message?: string; subType?: string; type?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = event.type ? STATUS_FOR_EVENT[event.type] : undefined;
  const providerId = event.data?.email_id;
  // Events we don't track (email.sent, clicked…) are acknowledged so Resend
  // stops retrying them.
  if (!status || !providerId) return NextResponse.json({ ok: true, ignored: true });

  const row = await prisma.emailLog.findFirst({ where: { providerId } });
  if (!row) return NextResponse.json({ ok: true, unknown: true });
  if ((RANK[row.status] ?? 0) > RANK[status]) return NextResponse.json({ ok: true, kept: row.status });

  const bounce = event.data?.bounce;
  const error =
    status === "BOUNCED"
      ? [bounce?.type, bounce?.subType, bounce?.message].filter(Boolean).join(" · ") || "Bounced by the receiving mail server"
      : status === "COMPLAINED"
        ? "The recipient marked it as spam"
        : status === "DELAYED"
          ? "The receiving server is slow to accept it — Resend keeps retrying"
          : null;

  await prisma.emailLog.update({ where: { id: row.id }, data: { status, error } });
  return NextResponse.json({ ok: true });
}
