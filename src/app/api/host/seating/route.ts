import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { recommendSchema } from "@/lib/hostflow/schemas";
import { getFloorState } from "@/lib/hostflow/floor";
import { recommendSeating } from "@/lib/hostflow/seating";

// Smart-seating recommendation for a hypothetical party (used by the walk-in
// form and the AI assistant's "can we fit N?" answers).
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = recommendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const state = await getFloorState(ctx.restaurantId);
  const recommendation = recommendSeating(state, parsed.data.partySize, { sectionId: parsed.data.sectionId });
  return NextResponse.json({ recommendation });
}
