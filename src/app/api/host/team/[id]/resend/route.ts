import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { resendInvite } from "@/lib/hostflow/team";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req, { role: "OWNER" });
  if ("error" in ctx) return ctx.error;
  const rl = await checkRateLimit(`team-invite:${ctx.restaurantId}`, 60 * 60 * 1000, 20);
  if (rl.limited) return NextResponse.json({ error: "Too many invites for now. Try again in a while." }, { status: 429 });
  try {
    await resendInvite(ctx.restaurantId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}
