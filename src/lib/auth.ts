import crypto from "crypto";

/**
 * Minimal admin session handling — no extra auth library needed.
 * One admin account per restaurant instance, configured via env vars
 * (ADMIN_EMAIL / ADMIN_PASSWORD). Good enough for a single-owner
 * restaurant admin panel; if you later build the multi-tenant SaaS
 * version, swap this for real per-user auth (e.g. NextAuth or Supabase
 * Auth) since you'll have many admins across many restaurants.
 */

const COOKIE_NAME = "hf_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not set. Add it to your .env file.");
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionToken(email: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${email}.${expires}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    // Parse from the end: the signature (hex) and expires (digits) never
    // contain a ".", but the email can (e.g. owner@example.com), so splitting
    // left-to-right would mis-parse. Pop the fixed trailing fields and treat
    // whatever remains as the email.
    const parts = decoded.split(".");
    const signature = parts.pop();
    const expiresStr = parts.pop();
    const email = parts.join(".");
    if (!email || !expiresStr || !signature) return false;

    const expected = sign(`${email}.${expiresStr}`);
    const validSignature =
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!validSignature) return false;

    const expires = Number(expiresStr);
    if (Number.isNaN(expires) || Date.now() > expires) return false;

    return true;
  } catch {
    return false;
  }
}

export function checkAdminCredentials(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedEmail || !expectedPassword) {
    throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD not set. Add them to your .env file.");
  }
  return email.trim().toLowerCase() === expectedEmail.trim().toLowerCase() && password === expectedPassword;
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
