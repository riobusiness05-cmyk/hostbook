import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { getFloorState } from "@/lib/hostflow/floor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const state = await getFloorState(ctx.restaurantId);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}
