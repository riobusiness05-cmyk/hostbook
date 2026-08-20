import { prisma } from "@/lib/prisma";
import { combineDateAndTime, toLocalTimeStr, minutesOfDayInTz } from "@/lib/availability";
import type { SectionDTO, TableDTO } from "./floor";

// A booking-planning view for a specific (usually future) date. Unlike the
// live floor state, nothing here is "occupied now" — it answers "what's booked
// on this day and where", so the host can plan tomorrow's service.

export type DayBooking = {
  id: string;
  time: string; // "HH:MM"
  reservationTime: string;
  customerName: string;
  partySize: number;
  tableId: string | null;
  tableNumber: number | null;
  // Extra tables held alongside tableId for a party too big for one table —
  // empty for an ordinary single-table booking.
  comboTableNumbers: number[];
  sectionName: string | null;
  occasion: string | null;
  seatingPreference: string | null;
  isVip: boolean;
  status: string;
};

export type DayMetrics = {
  bookings: number;
  covers: number;
  tablesBooked: number;
  tablesTotal: number;
  peakLabel: string;
  peakCovers: number;
  firstSeating: string | null;
  lastSeating: string | null;
  byArea: { name: string; color: string; bookings: number; covers: number }[];
};

export type DayPlan = {
  date: string;
  tables: TableDTO[];
  sections: SectionDTO[];
  bookings: DayBooking[];
  metrics: DayMetrics;
};

export async function getDayPlan(restaurantId: string, dateStr: string): Promise<DayPlan> {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  const dayStart = combineDateAndTime(dateStr, "00:00", restaurant.timezone);
  const dayEnd = combineDateAndTime(dateStr, "23:59", restaurant.timezone);

  const [tables, sections, reservations] = await Promise.all([
    prisma.diningTable.findMany({
      where: { restaurantId, isActive: true },
      include: { section: true, server: true },
      orderBy: { tableNumber: "asc" },
    }),
    prisma.section.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" } }),
    prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: ["PENDING", "CONFIRMED", "ARRIVED", "SEATED"] },
        reservationTime: { gte: dayStart, lte: dayEnd },
      },
      include: { comboTables: true },
      orderBy: { reservationTime: "asc" },
    }),
  ]);

  // A combo reservation's extra tables aren't anyone's `tableId` — without
  // registering them too, a big-party booking spanning e.g. Tables 15+16
  // would only show Table 16 as booked on this day's plan, leaving Table 15
  // free to double-book.
  const bookingsByTable = new Map<string, number>();
  for (const r of reservations) {
    const heldTableIds = [r.tableId, ...r.comboTables.map((ct) => ct.tableId)].filter((id): id is string => !!id);
    for (const id of heldTableIds) {
      bookingsByTable.set(id, (bookingsByTable.get(id) ?? 0) + 1);
    }
  }

  const tableDTOs: TableDTO[] = tables.map((t) => {
    const count = bookingsByTable.get(t.id) ?? 0;
    const status = t.status === "BLOCKED" ? "BLOCKED" : count > 0 ? "RESERVED" : "AVAILABLE";
    return {
      id: t.id,
      tableNumber: t.tableNumber,
      name: t.name,
      status: status as TableDTO["status"],
      seatsMin: t.capacityMin,
      seatsMax: t.capacityMax,
      shape: t.shape,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      rotation: t.rotation,
      notes: t.notes,
      isJoinable: t.isJoinable,
      section: t.section ? { id: t.section.id, name: t.section.name, color: t.section.color } : null,
      server: t.server ? { id: t.server.id, name: t.server.name, color: t.server.color } : null,
      session: null,
      reservation: null,
      upcomingReservation: null,
      mergedIntoId: t.mergedIntoId,
      bookingCount: count,
    };
  });

  const sectionDTOs: SectionDTO[] = sections.map((sec) => {
    const secTables = tableDTOs.filter((t) => t.section?.id === sec.id);
    return {
      id: sec.id,
      name: sec.name,
      color: sec.color,
      isOutdoor: sec.isOutdoor,
      room: sec.room,
      tableCount: secTables.length,
      occupiedCount: secTables.filter((t) => t.status === "RESERVED").length,
      availableCount: secTables.filter((t) => t.status === "AVAILABLE").length,
    };
  });

  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));
  const tableInfoById = new Map(tables.map((t) => [t.id, { number: t.tableNumber, sectionId: t.sectionId }]));

  const bookings: DayBooking[] = reservations.map((r) => {
    const info = r.tableId ? tableInfoById.get(r.tableId) : undefined;
    return {
      id: r.id,
      time: toLocalTimeStr(r.reservationTime, restaurant.timezone),
      reservationTime: r.reservationTime.toISOString(),
      customerName: r.customerName,
      partySize: r.partySize,
      tableId: r.tableId,
      tableNumber: info?.number ?? null,
      comboTableNumbers: r.comboTables
        .map((ct) => tableInfoById.get(ct.tableId)?.number)
        .filter((n): n is number => n != null),
      sectionName: info?.sectionId ? sectionNameById.get(info.sectionId) ?? null : null,
      occasion: r.occasion,
      seatingPreference: r.seatingPreference,
      isVip: r.isVip,
      status: r.status,
    };
  });

  // Peak: bucket covers by hour of the reservation time.
  const coversByHour = new Map<number, number>();
  for (const r of reservations) {
    const h = Math.floor(minutesOfDayInTz(r.reservationTime, restaurant.timezone) / 60);
    coversByHour.set(h, (coversByHour.get(h) ?? 0) + r.partySize);
  }
  let peakHour = -1;
  let peakCovers = 0;
  for (const [h, c] of coversByHour) if (c > peakCovers) { peakHour = h; peakCovers = c; }
  const peakLabel = peakHour >= 0 ? formatHour(peakHour) : "—";

  const byArea = sections.map((sec) => {
    const rs = reservations.filter((r) => r.tableId && tableInfoById.get(r.tableId)?.sectionId === sec.id);
    return { name: sec.name, color: sec.color, bookings: rs.length, covers: rs.reduce((n, r) => n + r.partySize, 0) };
  });

  const metrics: DayMetrics = {
    bookings: reservations.length,
    covers: reservations.reduce((n, r) => n + r.partySize, 0),
    tablesBooked: bookingsByTable.size,
    tablesTotal: tables.length,
    peakLabel,
    peakCovers,
    firstSeating: reservations[0] ? toLocalTimeStr(reservations[0].reservationTime, restaurant.timezone) : null,
    lastSeating: reservations.length
      ? toLocalTimeStr(reservations[reservations.length - 1].reservationTime, restaurant.timezone)
      : null,
    byArea,
  };

  return { date: dateStr, tables: tableDTOs, sections: sectionDTOs, bookings, metrics };
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${period}`;
}
