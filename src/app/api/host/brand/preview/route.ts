import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { settingsSchema } from "@/lib/hostflow/schemas";
import { renderSampleThankYous } from "@/lib/hostflow/guestEmails";

// The live preview on the brand kit page: renders the first sample with the
// page's unsaved draft laid over the saved settings. Nothing is written.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const parsed = settingsSchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  const overrides = parsed.success ? parsed.data : {};
  const [sample] = await renderSampleThankYous(ctx.restaurantId, overrides);
  return new NextResponse(sample.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
