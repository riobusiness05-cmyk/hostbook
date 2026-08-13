import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/billing/schemas";
import { sendEmail, passwordResetEmailHtml } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1h

// Always responds with the same generic message regardless of whether the
// email matches an account — confirming/denying an account's existence to
// an unauthenticated caller is its own small information leak (and this
// endpoint sends real email, so it's rate-limited against being used to
// spam an arbitrary inbox with reset links).
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`forgot-password:${ip}`, 60 * 60 * 1000, 5);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const account = await prisma.account.findUnique({ where: { email: normalizedEmail } });

  if (account) {
    const passwordResetToken = crypto.randomBytes(24).toString("base64url");
    await prisma.account.update({
      where: { id: account.id },
      data: { passwordResetToken, passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/hostflow/reset-password?token=${passwordResetToken}`;
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Reset your Host Flow password",
        html: passwordResetEmailHtml(resetUrl, account.name),
      });
    } catch (err) {
      console.error("[forgot-password] email failed:", err);
    }
  }

  return NextResponse.json({ ok: true, message: "If an account exists for that email, we've sent a reset link." });
}
