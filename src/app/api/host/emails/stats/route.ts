import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { emailStatsForMonth } from "@/lib/hostflow/guestEmails";

// This month's thank-you numbers for the dashboard card.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await emailStatsForMonth(ctx.restaurantId), { headers: { "Cache-Control": "no-store" } });
}
