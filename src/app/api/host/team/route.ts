import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { inviteMember, listTeam } from "@/lib/hostflow/team";
import { checkRateLimit } from "@/lib/rateLimit";

// Who can sign in to this venue. Owners manage it; everyone can see it.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req, { requireAccess: false });
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ members: await listTeam(ctx.restaurantId, ctx.accountId) });
}

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]),
});

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req, { role: "OWNER" });
  if ("error" in ctx) return ctx.error;
  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name, a valid email and a role." }, { status: 400 });
  // Invites send email; cap them so a compromised owner login can't spam.
  const rl = await checkRateLimit(`team-invite:${ctx.restaurantId}`, 60 * 60 * 1000, 20);
  if (rl.limited) return NextResponse.json({ error: "Too many invites for now. Try again in a while." }, { status: 429 });
  try {
    const member = await inviteMember(ctx.restaurantId, { accountId: ctx.accountId }, parsed.data);
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return handleActionError(err);
  }
}
