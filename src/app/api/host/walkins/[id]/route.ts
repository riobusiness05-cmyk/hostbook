import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { updateWalkinSchema } from "@/lib/hostflow/schemas";
import { updateWalkin } from "@/lib/hostflow/actions";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = updateWalkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await updateWalkin(ctx.restaurantId, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}
