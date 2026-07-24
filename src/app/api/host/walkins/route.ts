import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { createWalkinSchema } from "@/lib/hostflow/schemas";
import { addWalkin } from "@/lib/hostflow/actions";
import { getFloorState } from "@/lib/hostflow/floor";

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const state = await getFloorState(ctx.restaurantId);
  return NextResponse.json({ walkins: state.walkins });
}

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = createWalkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid walk-in", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const walkin = await addWalkin(ctx.restaurantId, parsed.data);
    return NextResponse.json({ walkin }, { status: 201 });
  } catch (err) {
    return handleActionError(err);
  }
}
