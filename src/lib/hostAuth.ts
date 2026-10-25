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
export type HostRole = "OWNER" | "MANAGER" | "STAFF";
export const HOST_ROLES: HostRole[] = ["OWNER", "MANAGER", "STAFF"];
export type HostSession = { restaurantId: string; accountId: string; version: number; role: HostRole };

export function createHostSessionToken(restaurantId: string, accountId: string, version = 0): string {
  const expires = Date.now() + TTL_MS;
  const payload = `${restaurantId}|${accountId}|${expires}|${version}`;
  return Buffer.from(`${payload}|${sign(payload)}`).toString("base64url");
}

/** Checks the signature and expiry only — says the token is genuine, not
 *  that it is still welcome. Use resolveHostSession() for that. */
export function readHostSession(token: string | undefined): HostSession | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split("|");
    // Tokens issued before sessions were versioned have four parts; they
    // count as version 0, which is what every account starts at.
    const [restaurantId, accountId, expiresStr, versionStr, signature] =
      parts.length === 4 ? [parts[0], parts[1], parts[2], undefined, parts[3]] : parts;
    if (!restaurantId || !accountId || !expiresStr || !signature || parts.length > 5) return null;
    const payload = versionStr === undefined ? `${restaurantId}|${accountId}|${expiresStr}` : `${restaurantId}|${accountId}|${expiresStr}|${versionStr}`;
    const expected = sign(payload);
    const ok =
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!ok) return null;
    const expires = Number(expiresStr);
    if (Number.isNaN(expires) || Date.now() > expires) return null;
    const version = versionStr === undefined ? 0 : Number(versionStr);
    if (!Number.isInteger(version)) return null;
    // Role is filled in by resolveHostSession from the database — never
    // from the token, so a role change takes effect on the next request.
    return { restaurantId, accountId, version, role: "STAFF" };
  } catch {
    return null;
  }
}

/** A genuine token is only a session while the account still exists, still
 *  belongs to that venue, and hasn't had its sessions revoked (password
 *  reset bumps `sessionVersion`). One indexed read per request. */
export async function resolveHostSession(token: string | undefined): Promise<HostSession | null> {
  const parsed = readHostSession(token);
  if (!parsed) return null;
  const account = await prisma.account.findUnique({
    where: { id: parsed.accountId },
    select: { restaurantId: true, sessionVersion: true, role: true },
  });
  if (!account || account.restaurantId !== parsed.restaurantId || account.sessionVersion !== parsed.version) return null;
  return { ...parsed, role: normalizeRole(account.role) };
}

/** Accounts created before roles existed carry "MANAGER" (the old column
 *  default) or "OWNER" (registration). Anything unknown is treated as the
 *  least-privileged role. */
export function normalizeRole(role: string | null | undefined): HostRole {
  return role === "OWNER" || role === "MANAGER" || role === "STAFF" ? role : "STAFF";
}

/** Ends every session this account holds, everywhere. */
export async function revokeAllSessions(accountId: string): Promise<number> {
  const updated = await prisma.account.update({ where: { id: accountId }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  return updated.sessionVersion;
}

// ── One-time links (verify email, reset password) ───────────────────────────
// The database holds only a hash of the token; the token itself exists only
// in the email we sent. A read-only leak of the table yields nothing usable.
export function hashOneTimeToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── Login ───────────────────────────────────────────────────────────────────
export type AuthenticateResult = {
  restaurantId: string;
  accountId: string;
  sessionVersion: number;
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
    sessionVersion: account.sessionVersion,
    accountName: account.name,
    restaurantName: account.restaurant.name,
    isNewIp,
  };
}

// ── Cookie helpers ────────────────────────────────────────────────────────
export const HOST_COOKIE_NAME = COOKIE;
export const HOST_COOKIE_MAX_AGE_SECONDS = TTL_MS / 1000;

/** For server components / route handlers using next/headers cookies(). */
export function getServerHostSession(): Promise<HostSession | null> {
  return resolveHostSession(cookies().get(COOKIE)?.value);
}

/** For route handlers with a NextRequest. */
export function getRequestHostSession(req: NextRequest): Promise<HostSession | null> {
  return resolveHostSession(req.cookies.get(COOKIE)?.value);
}
