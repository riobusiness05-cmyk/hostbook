import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/billing/schemas";
import { hashPassword, createHostSessionToken, HOST_COOKIE_NAME, HOST_COOKIE_MAX_AGE_SECONDS } from "@/lib/hostAuth";
import { startTrial } from "@/lib/billing/subscription";
import { getOrCreateStripeCustomer } from "@/lib/stripe";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 48; // 48h

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return base || "restaurant";
}

async function uniqueSlug(desired: string): Promise<string> {
  let slug = desired;
  let n = 2;
  while (await prisma.restaurant.findUnique({ where: { slug } })) {
    slug = `${desired}-${n++}`;
  }
  return slug;
}

/**
 * Self-serve restaurant signup: creates the tenant, an OWNER account, starts
 * the free trial (length set by TRIAL_DAYS in billing/subscription.ts), (best-effort) creates a Stripe customer, and logs the
 * new owner straight in — same session cookie /api/hostflow/login issues —
 * so they land in /host immediately rather than a dead-end "check your
 * email" screen. Email verification happens in the background (see
 * src/lib/email.ts); it doesn't block access.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`register:${ip}`, 60 * 60 * 1000, 5);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many accounts created from this device. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details and try again.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { restaurantName, ownerName, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existingAccount = await prisma.account.findUnique({ where: { email: normalizedEmail } });
  if (existingAccount) {
    return NextResponse.json({ error: "An account with that email already exists. Try signing in instead." }, { status: 409 });
  }

  const slug = await uniqueSlug(slugify(parsed.data.slug || restaurantName));
  const emailVerifyToken = crypto.randomBytes(24).toString("base64url");

  const { restaurant, account } = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: { slug, name: restaurantName, email: normalizedEmail },
    });
    const account = await tx.account.create({
      data: {
        restaurantId: restaurant.id,
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        name: ownerName,
        role: "OWNER",
        emailVerifyToken,
        emailVerifyExpiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      },
    });
    return { restaurant, account };
  });

  await startTrial(restaurant.id);

  // Best-effort: neither of these should block registration if unconfigured.
  try {
    const customerId = await getOrCreateStripeCustomer(restaurant, account, null);
    await prisma.subscription.update({ where: { restaurantId: restaurant.id }, data: { stripeCustomerId: customerId } });
  } catch (err) {
    console.error("[register] Stripe customer creation skipped:", (err as Error).message);
  }

  try {
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/hostflow/verify?token=${emailVerifyToken}`;
    await sendEmail({
      to: normalizedEmail,
      subject: "Verify your Host Flow account",
      html: verificationEmailHtml(verifyUrl, restaurantName),
    });
  } catch (err) {
    console.error("[register] verification email failed:", err);
  }

  const token = createHostSessionToken(restaurant.id, account.id);
  const res = NextResponse.json({ ok: true, slug: restaurant.slug });
  res.cookies.set(HOST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: HOST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
