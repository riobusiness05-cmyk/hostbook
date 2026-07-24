import { prisma } from "@/lib/prisma";
import type { Restaurant } from "@prisma/client";

/**
 * Core reservation engine: opening hours + tables + existing bookings +
 * blackout dates -> available time slots / table assignment.
 *
 * Simplification: dates/times are treated as naive local time (no timezone
 * conversion library). For a single-restaurant-per-instance deployment this
 * is fine as long as the server's TZ env var is set to the restaurant's
 * timezone (see README). If you later consolidate into a multi-region
 * multi-tenant SaaS, swap this for a proper tz-aware library (e.g.
 * date-fns-tz) keyed off restaurant.timezone.
 */

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"];

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

/** Builds a local Date from a "YYYY-MM-DD" date string + "HH:MM" time string. */
export function combineDateAndTime(dateStr: string, time: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function dayOfWeekFromDateStr(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/**
 * Formats a Date as a local "YYYY-MM-DD" string using the server's local
 * (process TZ) getters — NOT toISOString(), which is UTC and can roll the
 * date to the previous/next day whenever the server's TZ offset isn't
 * zero. Always use this (and toLocalTimeStr below) instead of
 * toISOString()/toTimeString() when displaying or re-combining a
 * reservationTime or blackout date, so date math stays consistent with
 * combineDateAndTime, which also builds Dates from local getters.
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toLocalTimeStr(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

async function getOpeningHoursForDate(restaurantId: string, dateStr: string) {
  const dow = dayOfWeekFromDateStr(dateStr);
  return prisma.openingHour.findUnique({
    where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: dow } },
  });
}

async function getBlackoutForDate(restaurantId: string, dateStr: string) {
  const dayStart = combineDateAndTime(dateStr, "00:00");
  const dayEnd = combineDateAndTime(dateStr, "23:59");
  return prisma.blackoutDate.findMany({
    where: { restaurantId, date: { gte: dayStart, lte: dayEnd } },
  });
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Guards against booking a time that's already gone. Returns:
 *  - null if `dateStr` is a calendar day strictly before today — nothing on
 *    that date can ever be booked again.
 *  - the earliest bookable minute-of-day for `dateStr` otherwise: 0 for any
 *    future date, or the current minute-of-day if `dateStr` is today (so
 *    "today" can't offer/accept a slot that already started).
 */
function earliestBookableMinute(dateStr: string): number | null {
  const today = toLocalDateStr(new Date());
  if (dateStr < today) return null;
  if (dateStr > today) return 0;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
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
  const { restaurant, dateStr, partySize, intervalMinutes = 30 } = params;

  const earliestMinute = earliestBookableMinute(dateStr);
  if (earliestMinute === null) return []; // date has already passed

  const hours = await getOpeningHoursForDate(restaurant.id, dateStr);
  if (!hours || hours.isClosed) return [];

  const blackouts = await getBlackoutForDate(restaurant.id, dateStr);
  if (blackouts.some((b) => b.fullDay)) return [];

  return computeSlots({ restaurant, dateStr, partySize, intervalMinutes, hours, blackouts, earliestMinute });
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
}): Promise<string[]> {
  const { restaurant, dateStr, partySize, intervalMinutes, hours, blackouts, earliestMinute } = params;

  const tables = await prisma.diningTable.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      status: { not: "BLOCKED" }, // out-of-service tables (e.g. broken furniture) are never bookable
      capacityMax: { gte: partySize },
      capacityMin: { lte: partySize },
    },
  });
  if (tables.length === 0) return [];

  const dayStart = combineDateAndTime(dateStr, "00:00");
  const dayEnd = combineDateAndTime(dateStr, "23:59");
  const existingReservations = await prisma.reservation.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ACTIVE_STATUSES },
      reservationTime: { gte: dayStart, lte: dayEnd },
    },
  });

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

    const hasFreeTable = tables.some((table) => {
      const conflicting = existingReservations.filter((r) => r.tableId === table.id);
      return !conflicting.some((r) => {
        const rStart = r.reservationTime.getHours() * 60 + r.reservationTime.getMinutes();
        const rEnd = rStart + r.durationMinutes;
        return rangesOverlap(slotStart, slotEnd, rStart, rEnd);
      });
    });

    if (hasFreeTable) slots.push(minutesToTime(slotStart));
  }

  return slots;
}

/**
 * Finds one specific free table for a requested date/time/party size.
 * Used at reservation-creation time (in addition to getAvailableSlots,
 * which is used to show options) as the source of truth right before
 * booking, to reduce race conditions between two people booking the same
 * slot at once.
 */
export async function findAvailableTable(params: {
  restaurant: Restaurant;
  dateStr: string;
  time: string;
  partySize: number;
  seatingPreference?: string;
}) {
  const { restaurant, dateStr, time, partySize, seatingPreference } = params;

  const earliestMinute = earliestBookableMinute(dateStr);
  if (earliestMinute === null) return null; // date has already passed
  if (timeToMinutes(time) < earliestMinute) return null; // time on today has already passed

  const hours = await getOpeningHoursForDate(restaurant.id, dateStr);
  if (!hours || hours.isClosed) return null;

  const blackouts = await getBlackoutForDate(restaurant.id, dateStr);
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

  const tables = await prisma.diningTable.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      status: { not: "BLOCKED" }, // out-of-service tables (e.g. broken furniture) are never bookable
      capacityMax: { gte: partySize },
      capacityMin: { lte: partySize },
    },
    include: { section: true },
    orderBy: { capacityMax: "asc" }, // prefer the smallest table that fits, save big tables for big parties
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

  const dayStart = combineDateAndTime(dateStr, "00:00");
  const dayEnd = combineDateAndTime(dateStr, "23:59");
  const existingReservations = await prisma.reservation.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ACTIVE_STATUSES },
      reservationTime: { gte: dayStart, lte: dayEnd },
    },
  });

  for (const table of orderedTables) {
    const conflicting = existingReservations.filter((r) => r.tableId === table.id);
    const overlaps = conflicting.some((r) => {
      const rStart = r.reservationTime.getHours() * 60 + r.reservationTime.getMinutes();
      const rEnd = rStart + r.durationMinutes;
      return rangesOverlap(slotStart, slotEnd, rStart, rEnd);
    });
    if (!overlaps) return table;
  }

  return null;
}
