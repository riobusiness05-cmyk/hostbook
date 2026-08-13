import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Temporary debug endpoint — inspect RateLimitHit rows for a key prefix.
export async function GET(req: NextRequest) {
  const secret = process.env.MAINTENANCE_SECRET;
  if (!secret) return NextResponse.json({ error: "MAINTENANCE_SECRET is not set." }, { status: 500 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefix = new URL(req.url).searchParams.get("prefix") || "";
  const rows = await prisma.rateLimitHit.findMany({
    where: { key: { contains: prefix } },
    orderBy: { windowStart: "desc" },
    take: 20,
  });
  return NextResponse.json({ count: rows.length, rows });
}
