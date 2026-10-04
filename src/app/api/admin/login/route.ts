import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_COOKIE_NAME,
  checkAdminCredentials,
  createSessionToken,
} from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // This one password is the master key over every venue, so it gets the
  // tightest throttle in the app: per source address AND a global ceiling,
  // so a distributed guesser is capped too.
  const ip = getClientIp(req);
  const [perIp, global] = await Promise.all([
    checkRateLimit(`admin-login:${ip}`, 15 * 60 * 1000, 5),
    // High enough that a stranger can't lock the operator out by spamming
    // the form, low enough that guessing a real password is hopeless.
    checkRateLimit("admin-login:all", 60 * 60 * 1000, 120),
  ]);
  if (perIp.limited || global.limited) {
    const retry = Math.max(perIp.retryAfterSeconds, global.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  let valid: boolean;
  try {
    valid = checkAdminCredentials(parsed.data.email, parsed.data.password);
  } catch {
    return NextResponse.json(
      { error: "Admin login isn't configured on this deployment." },
      { status: 500 }
    );
  }

  if (!valid) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const token = createSessionToken(parsed.data.email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
