import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { minutesOfDayInTz } from "@/lib/availability";
import { resetDailyFloorState } from "@/lib/hostflow/actions";

export const dynamic = "force-dynamic";

const RESET_AFTER_MINUTES = 23 * 60; // 11:00 PM local
const RESET_BEFORE_MINUTES = 5 * 60; // ...through 5:00 AM local

/**
 * Runs on a schedule (see vercel.json) and, for every restaurant whose local
 * clock currently reads 11 PM or later (or it's the early hours before
 * opening), undoes anything left over from service — merged tables, and
 * tables staff forgot to release/clean — so the next day starts fresh.
 * The window spans midnight rather than checking only ">= 23:00" so a fixed
 * UTC cron trigger still catches every restaurant correctly across a DST
 * shift, when 23:00 UTC can land just after local midnight instead of just
 * before it. Each restaurant is only ever meaningfully reset once a day
 * since resetDailyFloorState is a no-op once the floor is already clean.
 * Guarded by CRON_SECRET — Vercel automatically sends it as a Bearer token
 * for scheduled invocations once the env var is set.
 */
async function reset(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set. Add it to .env to enable this endpoint." }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurants = await prisma.restaurant.findMany({ select: { id: true, slug: true, timezone: true } });
  const now = new Date();
  const results: { slug: string; tablesSplit: number; tablesFreshened: number }[] = [];

  for (const restaurant of restaurants) {
    const localMinutes = minutesOfDayInTz(now, restaurant.timezone);
    const isLateNight = localMinutes >= RESET_AFTER_MINUTES || localMinutes < RESET_BEFORE_MINUTES;
    if (!isLateNight) continue;
    const result = await resetDailyFloorState(restaurant.id);
    if (result.tablesSplit > 0 || result.tablesFreshened > 0) {
      results.push({ slug: restaurant.slug, ...result });
    }
  }

  return NextResponse.json({ checked: restaurants.length, reset: results });
}

export async function POST(req: NextRequest) {
  return reset(req);
}

export async function GET(req: NextRequest) {
  return reset(req);
}
