import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { getDayPlan } from "@/lib/hostflow/dayplan";
import { dateStrSchema } from "@/types";

export const dynamic = "force-dynamic";

// Booking plan for a specific date, scoped to the logged-in venue.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const date = new URL(req.url).searchParams.get("date");
  const parsed = dateStrSchema.safeParse(date);
  if (!parsed.success) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const plan = await getDayPlan(ctx.restaurantId, parsed.data);
  return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
}
