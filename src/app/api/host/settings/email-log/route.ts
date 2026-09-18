import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";

// The venue's recent emails and what happened to each — Settings → Emails.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const rows = await prisma.emailLog.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, kind: true, to: true, subject: true, status: true, error: true, providerId: true, createdAt: true },
  });
  return NextResponse.json({ emails: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
}
