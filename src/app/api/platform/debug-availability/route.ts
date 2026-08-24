import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots, dayOfWeekFromDateStr, toLocalDateStr, toLocalTimeStr } from "@/lib/availability";

// Read-only trace of exactly what getAvailableSlots sees for one restaurant
// + date — opening hours, blackouts, and every reservation/table-session
// actually holding a table that day — so a "no availability" report can be
// diagnosed from real data instead of guessing which of several possible
// causes it is.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const restaurantId = searchParams.get("restaurantId");
  const slug = searchParams.get("slug");
  const date = searchParams.get("date");
  const partySize = Number(searchParams.get("partySize") ?? "2");
  if ((!restaurantId && !slug) || !date) {
    return NextResponse.json({ error: "Missing restaurantId (or slug) and date" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: restaurantId ? { id: restaurantId } : { slug: slug! } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const rId = restaurant.id;
  const dow = dayOfWeekFromDateStr(date);
  const [hours, blackouts, tables, reservations, sessions] = await Promise.all([
    prisma.openingHour.findUnique({ where: { restaurantId_dayOfWeek: { restaurantId: rId, dayOfWeek: dow } } }),
    prisma.blackoutDate.findMany({ where: { restaurantId: rId } }),
    prisma.diningTable.findMany({ where: { restaurantId: rId } }),
    prisma.reservation.findMany({
      where: { restaurantId: rId, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { id: true, customerName: true, reservationTime: true, durationMinutes: true, status: true, tableId: true },
      orderBy: { reservationTime: "asc" },
    }),
    prisma.tableSession.findMany({ where: { restaurantId: rId, status: "SEATED" } }),
  ]);

  const slots = await getAvailableSlots({ restaurant, dateStr: date, partySize });

  return NextResponse.json({
    date,
    dayOfWeek: dow,
    settings: { bookingWindowDays: (await prisma.restaurantSettings.findUnique({ where: { restaurantId: rId } }))?.bookingWindowDays ?? null },
    hours: hours ? { openTime: hours.openTime, closeTime: hours.closeTime, isClosed: hours.isClosed } : null,
    allBlackoutDatesOnFile: blackouts.map((b) => ({
      id: b.id,
      date: b.date.toISOString(),
      fullDay: b.fullDay,
      startTime: b.startTime,
      endTime: b.endTime,
      reason: b.reason,
    })),
    tableSummary: {
      total: tables.length,
      active: tables.filter((t) => t.isActive).length,
      blocked: tables.filter((t) => t.status === "BLOCKED").length,
    },
    reservationsTouchingThisDate: reservations
      .filter((r) => toLocalDateStr(r.reservationTime, restaurant.timezone) === date)
      .map((r) => ({
        id: r.id,
        customerName: r.customerName,
        timeLocal: toLocalTimeStr(r.reservationTime, restaurant.timezone),
        durationMinutes: r.durationMinutes,
        status: r.status,
        tableId: r.tableId,
      })),
    seatedSessions: sessions.length,
    computedSlots: slots,
  });
}
