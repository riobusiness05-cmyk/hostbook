import { NextRequest, NextResponse } from "next/server";
import { bearerMatches } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkHealth, sendOpsAlert } from "@/lib/ops/health";

// Every 10 minutes: can we reach the database? If not, email the operator
// (without using the database). When it comes back after an outage, email
// again with how long it was down — the heartbeat row tells us.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HEARTBEAT_KEY = "health-heartbeat";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  if (!bearerMatches(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const report = await checkHealth(8000);
  const site = process.env.NEXT_PUBLIC_APP_URL || "https://hostflow.space";

  if (!report.ok) {
    const alert = await sendOpsAlert(`🔴 Host Flow can't reach its database`, [
      `Checked: ${report.checkedAt}`,
      `Database: ${report.db.error ?? "unreachable"} (${report.db.ms} ms)`,
      ``,
      `Every booking, login and floor action is failing right now.`,
      `Usual causes: Neon suspended (quota or billing) or a Neon incident.`,
      `Neon via Vercel: https://vercel.com/hostflow/~/stores`,
      `Status page: ${site}/api/health`,
    ]);
    return NextResponse.json({ ok: false, report, alerted: alert.ok, alertError: alert.error }, { status: 503 });
  }

  // Healthy: record the heartbeat; if the previous one is stale, we were down.
  let recoveredAfterMinutes: number | null = null;
  try {
    const prev = await prisma.platformSetting.findUnique({ where: { key: HEARTBEAT_KEY } });
    const now = new Date();
    if (prev) {
      const gapMin = Math.round((now.getTime() - new Date(prev.value).getTime()) / 60000);
      if (gapMin >= 25) recoveredAfterMinutes = gapMin; // more than two missed runs
    }
    await prisma.platformSetting.upsert({ where: { key: HEARTBEAT_KEY }, create: { key: HEARTBEAT_KEY, value: now.toISOString() }, update: { value: now.toISOString() } });
  } catch (e) {
    console.error("[health-check] heartbeat write failed", e);
  }
  if (recoveredAfterMinutes !== null) {
    await sendOpsAlert(`🟢 Host Flow is back (down ~${recoveredAfterMinutes} min)`, [
      `Checked: ${report.checkedAt}`,
      `The database is reachable again (${report.db.ms} ms).`,
      `Bookings and the floor are working. Check the Neon usage page if this was a quota suspension.`,
    ]);
  }
  return NextResponse.json({ ok: true, report, recoveredAfterMinutes });
}
