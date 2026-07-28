import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { resetFloorPlan } from "@/lib/hostflow/actions";

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  try {
    const result = await resetFloorPlan(ctx.restaurantId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleActionError(err);
  }
}
