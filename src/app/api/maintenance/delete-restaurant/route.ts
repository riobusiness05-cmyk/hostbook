import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * One-time-use maintenance endpoint: permanently deletes a restaurant (and
 * all cascaded records) by slug. Same bearer-token-guard pattern as
 * reset-billing, guarded by MAINTENANCE_SECRET. Used to remove throwaway
 * test signups created while verifying production, never for real tenants.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MAINTENANCE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "MAINTENANCE_SECRET is not set." }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const accountEmail = body?.accountEmail;
  if (typeof accountEmail !== "string" || !accountEmail) {
    return NextResponse.json({ error: "accountEmail is required" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({ where: { email: accountEmail }, include: { restaurant: true } });
  if (!account) {
    return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  }
  const restaurant = account.restaurant;

  await prisma.restaurant.delete({ where: { id: restaurant.id } });
  return NextResponse.json({ ok: true, deleted: restaurant.name });
}
