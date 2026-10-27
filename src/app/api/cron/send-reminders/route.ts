import { bearerMatches } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/hostflow/reminders";

// Hourly: day-before booking reminders. Guarded by CRON_SECRET like the others.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  if (!bearerMatches(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendDueReminders();
  return NextResponse.json({ ok: true, ...result });
}
