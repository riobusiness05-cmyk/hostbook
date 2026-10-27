import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/ops/health";

// Public, cheap, unauthenticated: 200 when the app can reach its database,
// 503 when it can't. Point an uptime monitor (UptimeRobot, Better Stack,
// Vercel Checks…) at this every minute — it will page you before a guest does.
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await checkHealth();
  return NextResponse.json(report, { status: report.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
