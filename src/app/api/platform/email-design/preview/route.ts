import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { renderSampleThankYous } from "@/lib/hostflow/guestEmails";

// Renders the venue's sample thank-yous with an UNSAVED template, so a
// design can be checked against real words before it's saved.
const schema = z.object({ restaurantId: z.string().min(1), html: z.string().max(200_000) });

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const samples = await renderSampleThankYous(parsed.data.restaurantId, { thankYouEmailHtml: parsed.data.html || null });
  return NextResponse.json({ samples }, { headers: { "Cache-Control": "no-store" } });
}
