import { NextRequest, NextResponse } from "next/server";
import { processScheduledEmails } from "@/lib/hostflow/guestEmails";

// Drains the thank-you queue (automatic sends with a delay). Runs every 5
// minutes via vercel.json. Guarded by CRON_SECRET, which Vercel sends as a
// Bearer token — same as the other cron routes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await processScheduledEmails();
  return NextResponse.json({ ok: true, ...result });
}
