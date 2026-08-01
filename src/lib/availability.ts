import { prisma } from "@/lib/prisma";
import type { Restaurant, Prisma } from "@prisma/client";
import { getSettings } from "@/lib/hostflow/floor";

/**
 * Core reservation engine: opening hours + tables + existing bookings +
 * blackout dates -> available time slots / table assignment.
 *
 * All wall-clock <-> UTC conversion below is timezone-aware, keyed off
 * `Restaurant.timezone` (an IANA zone, e.g. "Atlantic/Canary"). This used to
 * build/read Dates with the server process's OWN local timezone (via the
 * plain `new Date(y,m,d,h,min)` constructor and `.getHours()`/`.getMinutes()`
 * getters) — which happens to equal the restaurant's zone on a laptop set to
 * the same timezone, but on Vercel (serverless functions run in UTC) it
 * doesn't, so every booking was stored/read shifted by the restaurant's
 * UTC offset (1h for Atlantic/Canary in DST/summer) — the exact "booking
 * displayed one hour later than selected" bug. DEFAULT_TIMEZONE below is a
 * fallback for the few call sites that don't have a `restaurant` row in
 * scope (legacy single-tenant admin pages); every Host Flow call site
 * threads the real `restaurant.timezone` through explicitly.
 */

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"];

export const DEFAULT_TIMEZONE = "Atlantic/Canary";

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// The offset a given IANA zone is actually at for a specific instant (varies
// across DST transitions, which is exactly why this can't be a constant).
// Standard "double formatting" trick: format the UTC instant as if it were
// wall-clock in `timeZone`, re-interpret those same numbers as UTC, and the
// difference from the original instant is the zone's offset at that moment.
function tzOffsetMinutes(timeZone: string, utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcInstant)) parts[p.type] = p.value;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asIfUtc - utcInstant.getTime()) / 60000;
}

/** Builds the UTC Date for a "YYYY-MM-DD" date + "HH:MM" time as wall-clock
 *  time in `timeZone` (the restaurant's real local time), not the server's. */
export function combineDateAndTime(dateStr: string, time: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // One correction pass is enough — DST transitions never straddle more than
  // an hour, and offsets change in whole-hour steps for every zone this app
  // targets, so recomputing at the corrected instant can't oscillate.
  const offset = tzOffsetMinutes(timeZone, new Date(utcGuess));
  return new Date(utcGuess - offset * 60000);
}

export function dayOfWeekFromDateStr(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Pure calendar-date math (no time-of-day component), so this is done in
  // UTC deliberately — it sidesteps the server-local-timezone trap entirely
  // rather than needing a restaurant timezone for a question that isn't
  // actually time-zone-dependent.
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Formats a UTC Date as a "YYYY-MM-DD" wall-clock date string in `timeZone`
 * — NOT toISOString()/getFullYear(), both of which read a different
 * calendar day than the restaurant's whenever that zone's offset isn't
 * zero. Always use this (and toLocalTimeStr/minutesOfDayInTz below) instead
 * of local Date getters when displaying or re-combining a reservationTime or
 * blackout date, so date math stays consistent with combineDateAndTime.
 */
export function toLocalDateStr(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(date); // en-CA formats as YYYY-MM-DD
}

export function toLocalTimeStr(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const dtf = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  return dtf.format(date);
}

/** Minutes since midnight, restaurant-local — the timezone-aware replacement
 *  for `date.getHours() * 60 + date.getMinutes()`. */
export function minutesOfDayInTz(date: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  return timeToMinutes(toLocalTimeStr(date, timeZone));
}

async function getOpeningHoursForDate(restaurantId: string, dateStr: string) {
  const dow = dayOfWeekFromDateStr(dateStr);
  return prisma.openingHour.findUnique({
    where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: dow } },
  });
}

async function getBlackoutForDate(restaurantId: string, dateStr: string, timeZone: string) {
  const dayStart = combineDateAndTime(dateStr, "00:00", timeZone);
  const dayEnd = combineDateAndTime(dateStr, "23:59", timeZone);
  return prisma.blackoutDate.findMany({
    where: { restaurantId, date: { gte: dayStart, lte: dayEnd } },
  });
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Whole calendar days between today and `dateStr` (0 = today), for the
 *  `bookingWindowDays` cap — how far ahead guests may book online. */
function daysUntil(dateStr: string, timeZone: string): number {
  const today = combineDateAndTime(toLocalDateStr(new Date(), timeZone), "00:00", timeZone);
  const target = combineDateAndTime(dateStr, "00:00", timeZone);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Reservations already starting in the same 15-minute bucket as `slotStart`,
 *  restaurant-wide — the `maxBookingsPer15Min` service-pacing cap. A table
 *  can be physically free and a slot can still be closed if the kitchen is
 *  already at its intake limit for that window. */
function bucketStart(minute: number): number {
  return Math.floor(minute / 15) * 15;
}

/**
 * Guards against booking a time that's already gone. Returns:
 *  - null if `dateStr` is a calendar day strictly before today — nothing on
 *    that date can ever be booked again.
 *  - the earliest bookable minute-of-day for `dateStr` otherwise: 0 for any
 *    future date, or the current minute-of-day if `dateStr` is today (so
 *    "today" can't offer/accept a slot that already started).
 */
export function earliestBookableMinute(dateStr: string, timeZone: string): number | null {
  const today = toLocalDateStr(new Date(), timeZone);
  if (dateStr < today) return null;
  if (dateStr > today) return 0;
  return minutesOfDayInTz(new Date(), timeZone);
}

/**
 * A table currently holding a live, physically-seated party (a walk-in with
 * no Reservation row, or a reservation already checked in) — a TableSession
 * — can't be double-booked for "now" just because no Reservation overlaps
 * it. A session only ever represents *right now*, never a future date, so
 * this is only fetched (and only matters) when `dateStr` is today.
 */
export async function getActiveSessionRanges(
  restaurantId: string,
  dateStr: string,
  timeZone: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Map<string, { start: number; end: number }>> {
  const ranges = new Map<string, { start: number; end: number }>();
  if (dateStr !== toLocalDateStr(new Date(), timeZone)) return ranges;
  const sessions = await db.tableSession.findMany({ where: { restaurantId, status: "SEATED" } });
  for (const s of sessions) {
    const start = minutesOfDayInTz(s.seatedAt, timeZone);
    // Computed the same way `rEnd = rStart + r.durationMinutes` is for
    // reservations below, so a session running past midnight still compares
    // correctly instead of wrapping back to a small number.
    const durationMinutes = Math.round((s.expectedFinishAt.getTime() - s.seatedAt.getTime()) / 60000);
    ranges.set(s.tableId, { start, end: start + durationMinutes });
  }
  return ranges;
}

/**
 * Returns the list of "HH:MM" start times (in `intervalMinutes` steps) on
 * `dateStr` where at least one table big enough for `partySize` is free.
 */
export async function getAvailableSlots(params: {
  restaurant: Restaurant;
  dateStr: string;
  partySize: number;
  intervalMinutes?: number;
}): Promise<string[]> {
  const { restaurant, dateStr, partySize } = params;

  const settings = await getSettings(restaurant.id);
  const intervalMinutes = params.intervalMinutes ?? settings.bookingIntervalMinutes;
  if (daysUntil(dateStr, restaurant.timezone) > settings.bookingWindowDays) return []; // beyond how far ahead online booking is allowed

  const earliestMinute = earliestBookableMinute(dateStr, restaurant.timezone);
  if (earliestMinute === null) return []; // date has already passed

  const hours = await getOpeningHoursForDate(restaurant.id, dateStr);
  if (!hours || hours.isClosed) return [];

  const blackouts = await getBlackoutForDate(restaurant.id, dateStr, restaurant.timezone);
  if (blackouts.some((b) => b.fullDay)) return [];

  return computeSlots({ restaurant, dateStr, partySize, intervalMinutes, hours, blackouts, earliestMinute, maxBookingsPer15Min: settings.maxBookingsPer15Min });
}

// Split out from getAvailableSlots for clarity/testability.
async function computeSlots(params: {
  restaurant: Restaurant;
  dateStr: string;
  partySize: number;
  intervalMinutes: number;
  hours: { openTime: string; closeTime: string };
  blackouts: { fullDay: boolean; startTime: string | null; endTime: string | null }[];
  earliestMinute: number;
  maxBookingsPer15Min: number;
}): Promise<string[]> {
  const { restaurant, dateStr, partySize, intervalMinutes, hours, blackouts, earliestMinute, maxBookingsPer15Min } = params;

  const tables = await prisma.diningTable.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      status: { not: "BLOCKED" }, // out-of-service tables (e.g. broken furniture) are never bookable
      capacityMax: { gte: partySize },
    },
  });
  if (tables.length === 0) return [];

  const dayStart = combineDateAndTime(dateStr, "00:00", restaurant.timezone);
  const dayEnd = combineDateAndTime(dateStr, "23:59", restaurant.timezone);
  const existingReservations = await prisma.reservation.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ACTIVE_STATUSES },
      reservationTime: { gte: dayStart, lte: dayEnd },
    },
  });
  const sessionRanges = await getActiveSessionRanges(restaurant.id, dateStr, restaurant.timezone);

  const duration = restaurant.defaultReservationMinutes;
  const openMin = timeToMinutes(hours.openTime);
  // Last seatable slot must finish by close time. A close time at or before
  // the open time (e.g. 10:00–01:00) means closing past midnight.
  let closeMin = timeToMinutes(hours.closeTime);
  if (closeMin <= openMin) closeMin += 24 * 60;
  const lastSlotStart = Math.min(closeMin - duration, 24 * 60 - intervalMinutes);

  const partialBlackoutRanges = blackouts
    .filter((b) => !b.fullDay && b.startTime && b.endTime)
    .map((b) => ({ start: timeToMinutes(b.startTime!), end: timeToMinutes(b.endTime!) }));

  const slots: string[] = [];

  // Loop stays aligned to the openTime grid (so slots land on :00/:30 etc.);
  // slots earlier than `earliestMinute` (already passed, for a same-day
  // query) are skipped rather than shifting the whole grid.
  for (let slotStart = openMin; slotStart <= lastSlotStart; slotStart += intervalMinutes) {
    if (slotStart < earliestMinute) continue;
    const slotEnd = slotStart + duration;

    const blockedByBlackout = partialBlackoutRanges.some((r) =>
      rangesOverlap(slotStart, slotEnd, r.start, r.end)
    );
    if (blockedByBlackout) continue;

    const bucket = bucketStart(slotStart);
    const bucketCount = existingReservations.filter((r) => {
      const rStart = minutesOfDayInTz(r.reservationTime, restaurant.timezone);
      return bucketStart(rStart) === bucket;
    }).length;
    if (bucketCount >= maxBookingsPer15Min) continue; // kitchen/service pacing cap for this window

    const hasFreeTable = tables.some((table) => {
      const conflicting = existingReservations.filter((r) => r.tableId === table.id);
      const reservationConflict = conflicting.some((r) => {
        const rStart = minutesOfDayInTz(r.reservationTime, restaurant.timezone);
        const rEnd = rStart + r.durationMinutes;
        return rangesOverlap(slotStart, slotEnd, rStart, rEnd);
      });
      if (reservationConflict) return false;
      const session = sessionRanges.get(table.id);
      if (session && rangesOverlap(slotStart, slotEnd, session.start, session.end)) return false;
      return true;
    });

    if (hasFreeTable) slots.push(minutesToTime(slotStart));
  }

  return slots;
}

/**
 * Finds one specific free table for a requested date/time/party size.
 * Used at reservation-creation time (in addition to getAvailableSlots,
 * which is used to show options) as the source of truth right before
 * booking. Pass `db` (a `tx` from an interactive `prisma.$transaction`,
 * ideally Serializable) to run this check in the same transaction as the
 * `reservation.create` that follows it — see `createReservationForRestaurant`
 * in reservationActions.ts — so a second, concurrent booking for the same
 * table/slot is rejected by Postgres instead of silently double-booking.
 *
 * Pass `excludeReservationId` when re-checking availability for a
 * reservation that already exists (rescheduling) — otherwise that
 * reservation's own current slot reads as a conflict against itself, and a
 * guest who just wants a bigger table at the same time gets bounced to a
 * different one (or told nothing's free) for no reason.
 */
export async function findAvailableTable(params: {
  restaurant: Restaurant;
  dateStr: string;
  time: string;
  partySize: number;
  seatingPreference?: string;
  excludeReservationId?: string;
  db?: Prisma.TransactionClient;
}) {
  const { restaurant, dateStr, time, partySize, seatingPreference, excludeReservationId, db = prisma } = params;

  const settings = await getSettings(restaurant.id);
  if (daysUntil(dateStr, restaurant.timezone) > settings.bookingWindowDays) return null; // beyond how far ahead online booking is allowed

  const earliestMinute = earliestBookableMinute(dateStr, restaurant.timezone);
  if (earliestMinute === null) return null; // date has already passed
  if (timeToMinutes(time) < earliestMinute) return null; // time on today has already passed

  const hours = await getOpeningHoursForDate(restaurant.id, dateStr);
  if (!hours || hours.isClosed) return null;

  const blackouts = await getBlackoutForDate(restaurant.id, dateStr, restaurant.timezone);
  if (blackouts.some((b) => b.fullDay)) return null;

  const slotStart = timeToMinutes(time);
  const duration = restaurant.defaultReservationMinutes;
  const slotEnd = slotStart + duration;

  const openMin = timeToMinutes(hours.openTime);
  // Close time at or before open time means closing past midnight.
  let closeMin = timeToMinutes(hours.closeTime);
  if (closeMin <= openMin) closeMin += 24 * 60;
  if (slotStart < openMin || slotEnd > closeMin) return null;

  const blockedByBlackout = blackouts
    .filter((b) => !b.fullDay && b.startTime && b.endTime)
    .some((b) => rangesOverlap(slotStart, slotEnd, timeToMinutes(b.startTime!), timeToMinutes(b.endTime!)));
  if (blockedByBlackout) return null;

  const tables = await db.diningTable.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      status: { not: "BLOCKED" }, // out-of-service tables (e.g. broken furniture) are never bookable
      capacityMax: { gte: partySize },
    },
    include: { section: true },
    // Prefer the smallest table that fits; tableNumber is a tie-break so two
    // equal-capacity tables always resolve the same way — Postgres doesn't
    // guarantee row order on a tie without an explicit secondary sort key.
    orderBy: [{ capacityMax: "asc" }, { tableNumber: "asc" }],
  });

  // Honour an area seating preference (e.g. "Back Terrace"): float tables in
  // the requested section to the front, keeping smallest-fit ordering within
  // each group. Falls back gracefully if that area has nothing free.
  const prefArea = seatingPreference && seatingPreference !== "No preference" ? seatingPreference : null;
  const orderedTables = prefArea
    ? [...tables].sort((a, b) => {
        const aMatch = a.section?.name === prefArea ? 0 : 1;
        const bMatch = b.section?.name === prefArea ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return a.capacityMax - b.capacityMax;
      })
    : tables;

  const dayStart = combineDateAndTime(dateStr, "00:00", restaurant.timezone);
  const dayEnd = combineDateAndTime(dateStr, "23:59", restaurant.timezone);
  const existingReservations = (
    await db.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        status: { in: ACTIVE_STATUSES },
        reservationTime: { gte: dayStart, lte: dayEnd },
      },
    })
  ).filter((r) => r.id !== excludeReservationId);
  const sessionRanges = await getActiveSessionRanges(restaurant.id, dateStr, restaurant.timezone, db);

  const bucket = bucketStart(slotStart);
  const bucketCount = existingReservations.filter((r) => {
    const rStart = minutesOfDayInTz(r.reservationTime, restaurant.timezone);
    return bucketStart(rStart) === bucket;
  }).length;
  if (bucketCount >= settings.maxBookingsPer15Min) return null; // kitchen/service pacing cap for this window

  for (const table of orderedTables) {
    const conflicting = existingReservations.filter((r) => r.tableId === table.id);
    const overlaps = conflicting.some((r) => {
      const rStart = minutesOfDayInTz(r.reservationTime, restaurant.timezone);
      const rEnd = rStart + r.durationMinutes;
      return rangesOverlap(slotStart, slotEnd, rStart, rEnd);
    });
    if (overlaps) continue;
    const session = sessionRanges.get(table.id);
    if (session && rangesOverlap(slotStart, slotEnd, session.start, session.end)) continue;
    return table;
  }

  return null;
}
