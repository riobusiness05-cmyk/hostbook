import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashOneTimeToken, hashPassword, normalizeRole, type HostRole } from "@/lib/hostAuth";
import { sendEmail, teamInviteEmailHtml } from "@/lib/email";
import { HostFlowError } from "./actions";

/**
 * Who can sign in to a venue. Every member is an Account on the same
 * restaurant; the role decides what the dashboard lets them do (see
 * ROLE_RANK in apiContext.ts). Invites create the account straight away
 * with an unusable password and email a set-your-password link that
 * rides on the existing password-reset flow.
 */

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: HostRole;
  lastLoginAt: string | null;
  createdAt: string;
  /** Invited but never set a password / signed in. */
  pending: boolean;
  isYou: boolean;
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listTeam(restaurantId: string, viewerId: string): Promise<TeamMember[]> {
  const rows = await prisma.account.findMany({
    where: { restaurantId },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, name: true, email: true, role: true, lastLoginAt: true, createdAt: true, passwordResetToken: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: normalizeRole(r.role),
    lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    pending: r.lastLoginAt === null && r.passwordResetToken !== null,
    isYou: r.id === viewerId,
  }));
}

async function ownerCount(restaurantId: string): Promise<number> {
  return prisma.account.count({ where: { restaurantId, role: "OWNER" } });
}

/** Creates the member and emails them a link to choose a password. */
export async function inviteMember(
  restaurantId: string,
  inviter: { accountId: string },
  input: { name: string; email: string; role: HostRole }
): Promise<TeamMember> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.account.findUnique({ where: { email }, select: { restaurantId: true } });
  if (existing) {
    throw new HostFlowError(
      existing.restaurantId === restaurantId ? "That person is already on your team." : "That email already has a Host Flow account with another venue.",
      409
    );
  }
  const [restaurant, invitedBy] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } }),
    prisma.account.findUniqueOrThrow({ where: { id: inviter.accountId }, select: { name: true } }),
  ]);
  const token = crypto.randomBytes(24).toString("base64url");
  const account = await prisma.account.create({
    data: {
      restaurantId,
      email,
      name: input.name.trim(),
      role: input.role,
      // Nobody knows this password; the only way in is the emailed link.
      passwordHash: hashPassword(crypto.randomBytes(32).toString("base64url")),
      emailVerified: true,
      passwordResetToken: hashOneTimeToken(token),
      passwordResetExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  await sendInvite(restaurantId, token, { restaurantName: restaurant.name, invitedBy: invitedBy.name, name: account.name, email, role: input.role });
  return { id: account.id, name: account.name, email, role: input.role, lastLoginAt: null, createdAt: account.createdAt.toISOString(), pending: true, isYou: false };
}

/** A fresh link for someone who lost or let the first one expire. */
export async function resendInvite(restaurantId: string, accountId: string): Promise<void> {
  const [account, restaurant] = await Promise.all([
    prisma.account.findFirst({ where: { id: accountId, restaurantId } }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } }),
  ]);
  if (!account) throw new HostFlowError("Team member not found", 404);
  if (account.lastLoginAt) throw new HostFlowError("They've already signed in — they can use Forgot password instead.", 409);
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.account.update({
    where: { id: account.id },
    data: { passwordResetToken: hashOneTimeToken(token), passwordResetExpiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  await sendInvite(restaurantId, token, { restaurantName: restaurant.name, invitedBy: null, name: account.name, email: account.email, role: normalizeRole(account.role) });
}

async function sendInvite(
  restaurantId: string,
  token: string,
  p: { restaurantName: string; invitedBy: string | null; name: string; email: string; role: HostRole }
) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/hostflow/reset-password?token=${token}&welcome=1`;
  const result = await sendEmail({
    to: p.email,
    subject: `You've been added to ${p.restaurantName} on Host Flow`,
    html: teamInviteEmailHtml({ setPasswordUrl: url, restaurantName: p.restaurantName, invitedBy: p.invitedBy, name: p.name, role: p.role }),
    meta: { kind: "TEAM_INVITE", restaurantId },
  });
  if (!result.ok) throw new HostFlowError(`Added, but the invite email couldn't be sent — ${result.error}`, 502);
}

export async function changeRole(restaurantId: string, _actorId: string, accountId: string, role: HostRole): Promise<void> {
  const account = await prisma.account.findFirst({ where: { id: accountId, restaurantId } });
  if (!account) throw new HostFlowError("Team member not found", 404);
  if (normalizeRole(account.role) === "OWNER" && role !== "OWNER" && (await ownerCount(restaurantId)) <= 1) {
    throw new HostFlowError("A venue needs at least one owner. Make someone else an owner first.", 409);
  }
  await prisma.account.update({ where: { id: account.id }, data: { role } });
}

export async function removeMember(restaurantId: string, actorId: string, accountId: string): Promise<void> {
  if (accountId === actorId) throw new HostFlowError("You can't remove yourself. Ask another owner to do it.", 409);
  const account = await prisma.account.findFirst({ where: { id: accountId, restaurantId } });
  if (!account) throw new HostFlowError("Team member not found", 404);
  if (normalizeRole(account.role) === "OWNER" && (await ownerCount(restaurantId)) <= 1) {
    throw new HostFlowError("A venue needs at least one owner.", 409);
  }
  // Deleting the row ends their sessions at once: resolveHostSession
  // re-reads the account on every request.
  await prisma.account.delete({ where: { id: account.id } });
}
