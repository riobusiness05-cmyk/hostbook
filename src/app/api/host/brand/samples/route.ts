import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { renderSampleThankYous } from "@/lib/hostflow/guestEmails";

// Three sample thank-yous in the venue's current brand kit and tone.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ samples: await renderSampleThankYous(ctx.restaurantId) }, { headers: { "Cache-Control": "no-store" } });
}
