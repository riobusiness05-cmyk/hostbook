import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

// Read-only support view: did this venue's guests actually get their
// emails? Recent rows plus a 30-day picture, and — the usual real cause of
// "they never got the confirmation" — how many bookings had no email at all.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [rows, bookings] = await Promise.all([
    prisma.emailLog.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, kind: true, to: true, subject: true, status: true, error: true, createdAt: true, openedAt: true, clickedAt: true },
    }),
    prisma.reservation.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      select: { id: true, source: true, customerEmail: true, confirmationSentAt: true, createdAt: true, customerName: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const summary: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    summary[r.kind] ??= {};
    summary[r.kind][r.status] = (summary[r.kind][r.status] ?? 0) + 1;
  }
  const withEmail = bookings.filter((b) => !!b.customerEmail);
  const bookingStats = {
    total: bookings.length,
    withEmail: withEmail.length,
    withoutEmail: bookings.length - withEmail.length,
    withoutEmailBySource: bookings.filter((b) => !b.customerEmail).reduce<Record<string, number>>((acc, b) => { acc[b.source] = (acc[b.source] ?? 0) + 1; return acc; }, {}),
    withEmailButNoConfirmation: withEmail.filter((b) => !b.confirmationSentAt).map((b) => ({ id: b.id, name: b.customerName, createdAt: b.createdAt, source: b.source })),
  };

  // Mask addresses a little in the UI payload — the operator needs to recognise, not harvest.
  const mask = (e: string) => e.replace(/^(.{2}).*(@.*)$/, "$1…$2");
  return NextResponse.json({
    days: 30,
    summary,
    bookings: bookingStats,
    recent: rows.slice(0, 60).map((r) => ({ ...r, to: mask(r.to) })),
  });
}
