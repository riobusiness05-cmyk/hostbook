import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/billing/schemas";
import {
  hashPassword,
  createHostSessionToken,
  HOST_COOKIE_NAME,
  HOST_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/hostAuth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`reset-password:${ip}`, 15 * 60 * 1000, 15);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid token and a password of at least 8 characters." }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { passwordResetToken: parsed.data.token } });
  if (!account) {
    return NextResponse.json({ error: "That reset link is invalid. Request a new one." }, { status: 400 });
  }
  if (account.passwordResetExpiresAt && account.passwordResetExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "That reset link has expired. Request a new one." }, { status: 400 });
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      passwordHash: hashPassword(parsed.data.password),
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });

  // Reset succeeding is as good a proof of ownership as a login — sign them
  // straight in rather than making them turn around and log in again.
  const token = createHostSessionToken(account.restaurantId, account.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HOST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: HOST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
