import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { changeRole, removeMember } from "@/lib/hostflow/team";

const roleSchema = z.object({ role: z.enum(["OWNER", "MANAGER", "STAFF"]) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req, { role: "OWNER" });
  if ("error" in ctx) return ctx.error;
  const parsed = roleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a role." }, { status: 400 });
  try {
    await changeRole(ctx.restaurantId, ctx.accountId, params.id, parsed.data.role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req, { role: "OWNER" });
  if ("error" in ctx) return ctx.error;
  try {
    await removeMember(ctx.restaurantId, ctx.accountId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}
