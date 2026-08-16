import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Host Flow multi-tenant auth ─────────────────────────────────────────────
// Each venue has its own Account rows (email + password). A session is scoped
// to a restaurant, so every host surface resolves the tenant from the cookie
// rather than from a single "active restaurant" — that's what makes one login
// show one bar's floor and another login show a different bar's floor.
//
// Separate from the legacy env-based /admin login (cookie `hf_admin_session`)
// so the customer-site admin and the Host Flow product don't interfere.

const COOKIE = "hf_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET is not set. Add it to your .env file.");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

// ── Password hashing (scrypt; no external bcrypt dependency) ────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ── Session token: restaurantId|accountId|expires|sig (| never appears in a
// cuid, number, or hex signature, so parsing is unambiguous) ────────────────
export type HostSession = { restaurantId: string; accountId: string };

export function createHostSessionToken(restaurantId: string, accountId: string): string {
  const expires = Date.now() + TTL_MS;
  const payload = `${restaurantId}|${accountId}|${expires}`;
  return Buffer.from(`${payload}|${sign(payload)}`).toString("base64url");
}

export function readHostSession(token: string | undefined): HostSession | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [restaurantId, accountId, expiresStr, signature] = decoded.split("|");
    if (!restaurantId || !accountId || !expiresStr || !signature) return null;
    const expected = sign(`${restaurantId}|${accountId}|${expiresStr}`);
    const ok =
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!ok) return null;
    if (Date.now() > Number(expiresStr)) return null;
    return { restaurantId, accountId };
  } catch {
    return null;
  }
}

// ── Login ───────────────────────────────────────────────────────────────────
export type AuthenticateResult = {
  restaurantId: string;
  accountId: string;
  accountName: string;
  restaurantName: string;
  // True only when this account has logged in successfully from a different
  // IP before (never on the very first login ever — that happens seconds
  // after registration, and alerting on it would just duplicate the welcome
  // email) — see loginAlertEmailHtml in src/lib/email.ts.
  isNewIp: boolean;
};

export async function authenticate(email: string, password: string, ip: string): Promise<AuthenticateResult | null> {
  const account = await prisma.account.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { restaurant: { select: { name: true } } },
  });
  if (!account) return null;
  if (!verifyPassword(password, account.passwordHash)) return null;

  const isNewIp = account.lastLoginIp !== null && account.lastLoginIp !== ip;
  await prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } });

  return {
    restaurantId: account.restaurantId,
    accountId: account.id,
    accountName: account.name,
    restaurantName: account.restaurant.name,
    isNewIp,
  };
}

// ── Cookie helpers ────────────────────────────────────────────────────────
export const HOST_COOKIE_NAME = COOKIE;
export const HOST_COOKIE_MAX_AGE_SECONDS = TTL_MS / 1000;

/** For server components / route handlers using next/headers cookies(). */
export function getServerHostSession(): HostSession | null {
  return readHostSession(cookies().get(COOKIE)?.value);
}

/** For route handlers with a NextRequest. */
export function getRequestHostSession(req: NextRequest): HostSession | null {
  return readHostSession(req.cookies.get(COOKIE)?.value);
}
