import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  createHostSessionToken,
  HOST_COOKIE_NAME,
  HOST_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/hostAuth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { sendEmail, loginAlertEmailHtml } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Loose enough not to lock out a real user mistyping their password a few
  // times, tight enough to make brute-forcing a password impractical.
  const rl = await checkRateLimit(`login:${ip}`, 15 * 60 * 1000, 15);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password" }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof authenticate>>;
  try {
    session = await authenticate(parsed.data.email, parsed.data.password, ip);
  } catch {
    return NextResponse.json({ error: "Sign-in is not configured yet." }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  if (session.isNewIp) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const result = await sendEmail({
        to: parsed.data.email.trim().toLowerCase(),
        subject: "New sign-in to your Host Flow account",
        html: loginAlertEmailHtml({
          accountName: session.accountName,
          restaurantName: session.restaurantName,
          ip,
          whenLabel: new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC",
          resetPasswordUrl: `${appUrl}/hostflow/forgot-password`,
        }),
      });
      if (!result.ok) console.error("[login] alert email failed:", result.error);
    } catch (err) {
      console.error("[login] alert email failed:", err);
    }
  }

  const token = createHostSessionToken(session.restaurantId, session.accountId);
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
