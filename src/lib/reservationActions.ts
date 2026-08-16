import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  findAvailableTable,
  combineDateAndTime,
  timeToMinutes,
  minutesOfDayInTz,
  earliestBookableMinute,
  getActiveSessionRanges,
  toLocalDateStr,
  toLocalTimeStr,
} from "@/lib/availability";
import { notify } from "@/lib/hostflow/actions";
import { emitFloorChange } from "@/lib/hostflow/events";
import { sendEmail, reservationConfirmationHtml, ownerBookingNotificationHtml } from "@/lib/email";
import type { Restaurant } from "@prisma/client";
import type { CreateReservationInput } from "@/types";

/**
 * Shared reservation logic used by BOTH the public REST API
 * (src/app/api/reservations) and the AI chatbot's tool handlers
 * (src/lib/claude.ts). Keeping it in one place means the chatbot and the
 * fallback web form can never disagree about what counts as "available."
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Thrown from inside a transaction to signal "no table fits" — a normal,
// expected outcome (not a DB error), caught below and turned into a plain
// ActionResult failure rather than propagating.
class NoAvailabilityError extends Error {}

/**
 * Runs `fn` in a Serializable transaction, retrying once if Postgres detects
 * a write conflict (two requests both read "available" and both tried to
 * book the same table/slot — Prisma surfaces this as error code P2034).
 * This closes the race between `findAvailableTable`'s read and the
 * `reservation.create` that follows it, without needing a DB-level
 * exclusion constraint.
 */
async function withSerializableRetry<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
  } catch (err) {
    const isConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
    if (!isConflict) throw err;
    return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
  }
}

type CreatedReservationDTO = {
  id: string;
  date: string;
  time: string;
  partySize: number;
  tableNumber: number;
  // Extra table numbers when the party needed more than one table combined
  // — empty for an ordinary single-table booking. See findAvailableTable's
  // combo fallback in availability.ts.
  comboTableNumbers: number[];
  manageToken: string;
};

// Loads an existing reservation by idempotency key and shapes it into the
// same DTO a fresh create would return — used both for the pre-check and
// for resolving the race where two near-simultaneous requests with the same
// key both pass that pre-check and one loses the unique-constraint race.
async function findByIdempotencyKey(restaurant: Restaurant, key: string): Promise<CreatedReservationDTO | null> {
  const existing = await prisma.reservation.findUnique({
    where: { idempotencyKey: key },
    include: { table: true, comboTables: { include: { table: true } } },
  });
  if (!existing || existing.restaurantId !== restaurant.id || !existing.table) return null;
  return {
    id: existing.id,
    date: toLocalDateStr(existing.reservationTime, restaurant.timezone),
    time: toLocalTimeStr(existing.reservationTime, restaurant.timezone),
    partySize: existing.partySize,
    tableNumber: existing.table.tableNumber,
    comboTableNumbers: existing.comboTables.map((ct) => ct.table.tableNumber),
    manageToken: existing.manageToken ?? "",
  };
}

export async function createReservationForRestaurant(
  restaurant: Restaurant,
  input: CreateReservationInput
): Promise<ActionResult<CreatedReservationDTO>> {
  if (input.partySize > restaurant.maxPartySize) {
    return {
      ok: false,
      error: `Parties larger than ${restaurant.maxPartySize} need to call the restaurant directly to book — I can't auto-book that size.`,
    };
  }

  // A retried/duplicate request for the same submission attempt — a network
  // retry, or a double form-submit that slips past the disabled-button
  // guard — resolves to the reservation that attempt already created,
  // instead of creating a second, genuinely duplicate booking.
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(restaurant, input.idempotencyKey);
    if (existing) return { ok: true, data: existing };
  }

  // Fold the boolean "high chair" request into notes so it travels with the
  // booking and shows up for the host, without needing a dedicated column.
  const noteParts = [input.notes?.trim(), input.highChair ? "High chair requested" : ""].filter(Boolean);
  const manageToken = crypto.randomBytes(24).toString("base64url");

  try {
    const { reservation, table, comboTables } = await withSerializableRetry(async (tx) => {
      const found = await findAvailableTable({
        restaurant,
        dateStr: input.date,
        time: input.time,
        partySize: input.partySize,
        seatingPreference: input.seatingPreference,
        db: tx,
      });
      if (!found) throw new NoAvailabilityError();
      const { table, comboTables } = found;

      const reservation = await tx.reservation.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail || null,
          customerPhone: input.customerPhone || null,
          partySize: input.partySize,
          reservationTime: combineDateAndTime(input.date, input.time, restaurant.timezone),
          durationMinutes: restaurant.defaultReservationMinutes,
          status: "CONFIRMED",
          source: input.source,
          notes: noteParts.join(" · ") || null,
          occasion: input.occasion && input.occasion !== "None" ? input.occasion : null,
          seatingPreference:
            input.seatingPreference && input.seatingPreference !== "No preference" ? input.seatingPreference : null,
          accessibilityNeeds: input.accessibilityNeeds?.trim() || null,
          manageToken,
          idempotencyKey: input.idempotencyKey || null,
          comboTables:
            comboTables.length > 0 ? { create: comboTables.map((ct) => ({ tableId: ct.id })) } : undefined,
        },
      });
      return { reservation, table, comboTables };
    });

    // The table's colour on the floor plan is derived from live reservation
    // data (see getFloorState), so this is what actually makes booking a
    // table visibly change its colour — plus a notification so staff see it
    // without having to be staring at the floor when it happens.
    const tableLabel =
      comboTables.length > 0
        ? `Tables ${[table.tableNumber, ...comboTables.map((ct) => ct.tableNumber)].join(" + ")}`
        : `Table ${table.tableNumber}`;
    await notify(restaurant.id, {
      type: "RESERVATION_MADE",
      title: `New booking: ${input.customerName} (${input.partySize})`,
      body: `${tableLabel} · ${input.date} ${input.time}`,
      tableId: table.id,
    });
    emitFloorChange(restaurant.id, "reservation");

    // Best-effort — a guest's booking must never fail because a
    // confirmation/notification email couldn't be sent (Resend outage, bad
    // address, etc), so errors are caught rather than thrown. Still
    // *awaited* (not fired and forgotten): on Vercel, a serverless function
    // can be frozen the instant it returns its response, which would
    // silently kill an in-flight fetch to Resend before it ever left the box.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (input.customerEmail) {
      const manageUrl = `${appUrl}/manage/${reservation.id}?t=${manageToken}`;
      try {
        const result = await sendEmail({
          to: input.customerEmail,
          subject: `You're booked at ${restaurant.name}`,
          html: reservationConfirmationHtml({
            restaurantName: restaurant.name,
            customerName: input.customerName,
            date: input.date,
            time: input.time,
            partySize: input.partySize,
            manageUrl,
          }),
        });
        if (result.ok) {
          await prisma.reservation.update({ where: { id: reservation.id }, data: { confirmationSentAt: new Date() } });
        } else {
          console.error("[reservation] confirmation email failed", result.error);
        }
      } catch (err) {
        console.error("[reservation] confirmation email failed", err);
      }
    }

    // Notify the owner about guest-initiated bookings only — not bookings
    // the owner/staff just made themselves from the dashboard (those always
    // arrive with source: "ADMIN", forced server-side in
    // src/app/api/host/reservations/route.ts). Independent of whether the
    // guest left an email — a phone-only booking still notifies the owner.
    if (input.source !== "ADMIN") {
      try {
        const owner = await prisma.account.findFirst({
          where: { restaurantId: restaurant.id, role: "OWNER" },
          orderBy: { createdAt: "asc" },
        });
        const ownerEmail = owner?.email ?? restaurant.email;
        if (ownerEmail) {
          const result = await sendEmail({
            to: ownerEmail,
            subject: `New booking: ${input.customerName} (${input.partySize})`,
            html: ownerBookingNotificationHtml({
              restaurantName: restaurant.name,
              customerName: input.customerName,
              date: input.date,
              time: input.time,
              partySize: input.partySize,
              tableLabel,
              dashboardUrl: `${appUrl}/host`,
            }),
          });
          if (result.ok) {
            await prisma.reservation.update({ where: { id: reservation.id }, data: { ownerNotifiedAt: new Date() } });
          } else {
            console.error("[reservation] owner notification email failed", result.error);
          }
        }
      } catch (err) {
        console.error("[reservation] owner notification email failed", err);
      }
    }

    return {
      ok: true,
      data: {
        id: reservation.id,
        date: input.date,
        time: input.time,
        partySize: input.partySize,
        tableNumber: table.tableNumber,
        comboTableNumbers: comboTables.map((ct) => ct.tableNumber),
        manageToken,
      },
    };
  } catch (err) {
    if (err instanceof NoAvailabilityError) {
      return {
        ok: false,
        error: "That time is no longer available. Please suggest a different time or ask what's open.",
      };
    }
    // Two near-simultaneous requests carrying the same idempotency key can
    // both pass the pre-check above and both attempt the insert — Postgres
    // rejects the second on the unique constraint. Resolve it exactly like
    // the pre-check hit: fetch and return the row the other request created.
    if (input.idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await findByIdempotencyKey(restaurant, input.idempotencyKey);
      if (existing) return { ok: true, data: existing };
    }
    throw err;
  }
}

/**
 * Books a specific table a host picked directly from the floor plan (rather
 * than letting the engine auto-assign one). Same Serializable-transaction
 * race protection as `createReservationForRestaurant`, but the availability
 * check is scoped to just this one table instead of a search across all of
 * them, since the host has already chosen it.
 */
export async function bookSpecificTable(
  restaurant: Restaurant,
  params: {
    tableId: string;
    date: string;
    time: string;
    partySize: number;
    customerName: string;
    customerPhone?: string;
    occasion?: string;
  }
): Promise<ActionResult<{ id: string; tableNumber: number; date: string; time: string }>> {
  const manageToken = crypto.randomBytes(24).toString("base64url");

  try {
    const { reservation, table } = await withSerializableRetry(async (tx) => {
      const table = await tx.diningTable.findUnique({ where: { id: params.tableId } });
      if (!table || table.restaurantId !== restaurant.id) throw new NoAvailabilityError();
      if (table.status === "BLOCKED" || !table.isActive) throw new NoAvailabilityError();
      if (params.partySize > table.capacityMax) throw new NoAvailabilityError();

      const earliestMinute = earliestBookableMinute(params.date, restaurant.timezone);
      if (earliestMinute === null) throw new NoAvailabilityError(); // date has already passed
      const slotStart = timeToMinutes(params.time);
      if (slotStart < earliestMinute) throw new NoAvailabilityError(); // time on today has already passed

      const duration = restaurant.defaultReservationMinutes;
      const slotEnd = slotStart + duration;
      const dayStart = combineDateAndTime(params.date, "00:00", restaurant.timezone);
      const dayEnd = combineDateAndTime(params.date, "23:59", restaurant.timezone);
      const existing = await tx.reservation.findMany({
        where: {
          restaurantId: restaurant.id,
          tableId: params.tableId,
          status: { in: ["PENDING", "CONFIRMED"] },
          reservationTime: { gte: dayStart, lte: dayEnd },
        },
      });
      const overlaps = existing.some((r) => {
        const rStart = minutesOfDayInTz(r.reservationTime, restaurant.timezone);
        const rEnd = rStart + r.durationMinutes;
        return slotStart < rEnd && rStart < slotEnd;
      });
      if (overlaps) throw new NoAvailabilityError();

      // A currently-seated walk-in (no Reservation row) shouldn't be
      // silently double-booked either — same check createReservationForRestaurant
      // gets via findAvailableTable, applied here since a host picking a
      // specific table skips that search.
      const sessionRanges = await getActiveSessionRanges(restaurant.id, params.date, restaurant.timezone, tx);
      const session = sessionRanges.get(params.tableId);
      if (session && slotStart < session.end && session.start < slotEnd) throw new NoAvailabilityError();

      const reservation = await tx.reservation.create({
        data: {
          restaurantId: restaurant.id,
          tableId: params.tableId,
          customerName: params.customerName,
          customerPhone: params.customerPhone || null,
          partySize: params.partySize,
          reservationTime: combineDateAndTime(params.date, params.time, restaurant.timezone),
          durationMinutes: duration,
          status: "CONFIRMED",
          source: "ADMIN",
          occasion: params.occasion && params.occasion !== "None" ? params.occasion : null,
          manageToken,
        },
      });
      return { reservation, table };
    });

    await notify(restaurant.id, {
      type: "RESERVATION_MADE",
      title: `New booking: ${params.customerName} (${params.partySize})`,
      body: `Table ${table.tableNumber} · ${params.date} ${params.time}`,
      tableId: table.id,
    });
    emitFloorChange(restaurant.id, "reservation");

    return {
      ok: true,
      data: { id: reservation.id, tableNumber: table.tableNumber, date: params.date, time: params.time },
    };
  } catch (err) {
    if (err instanceof NoAvailabilityError) {
      return { ok: false, error: "That table isn't free at that time — pick a different time or table." };
    }
    throw err;
  }
}

export async function findUpcomingReservationsForCustomer(
  restaurant: Restaurant,
  identifier: { email?: string; phone?: string; name?: string }
) {
  const orConditions = [];
  if (identifier.email) orConditions.push({ customerEmail: identifier.email });
  if (identifier.phone) orConditions.push({ customerPhone: identifier.phone });
  if (identifier.name) orConditions.push({ customerName: { contains: identifier.name } });

  if (orConditions.length === 0) return [];

  return prisma.reservation.findMany({
    where: {
      restaurantId: restaurant.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      reservationTime: { gte: new Date() },
      OR: orConditions,
    },
    orderBy: { reservationTime: "asc" },
    take: 5,
  });
}

export async function cancelReservationById(
  restaurant: Restaurant,
  reservationId: string
): Promise<ActionResult<{ id: string }>> {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });

  if (!reservation || reservation.restaurantId !== restaurant.id) {
    return { ok: false, error: "I couldn't find that reservation." };
  }

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED" },
  });
  emitFloorChange(restaurant.id, "reservation"); // table reverts from reserved-colour back to available

  return { ok: true, data: { id: reservationId } };
}

// Statuses a booking can no longer meaningfully move from — already gone
// (cancelled/no-show/completed) or already checked in (seated).
const NOT_RESCHEDULABLE_STATUSES = ["CANCELLED", "COMPLETED", "NO_SHOW", "SEATED"];

export async function rescheduleReservationById(
  restaurant: Restaurant,
  reservationId: string,
  newDate: string,
  newTime: string,
  newPartySize?: number
): Promise<ActionResult<{ id: string; date: string; time: string }>> {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });

  if (!reservation || reservation.restaurantId !== restaurant.id) {
    return { ok: false, error: "I couldn't find that reservation." };
  }
  if (NOT_RESCHEDULABLE_STATUSES.includes(reservation.status)) {
    return { ok: false, error: "This booking can no longer be changed." };
  }

  const partySize = newPartySize ?? reservation.partySize;

  try {
    await withSerializableRetry(async (tx) => {
      const found = await findAvailableTable({
        restaurant,
        dateStr: newDate,
        time: newTime,
        partySize,
        seatingPreference: reservation.seatingPreference ?? undefined,
        // Otherwise this reservation's own current slot reads as a conflict
        // against itself, and e.g. just bumping party size at the same time
        // gets bounced to a different table (or rejected) for no reason.
        excludeReservationId: reservationId,
        db: tx,
      });
      if (!found) throw new NoAvailabilityError();
      const { table, comboTables } = found;

      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          reservationTime: combineDateAndTime(newDate, newTime, restaurant.timezone),
          partySize,
          tableId: table.id,
          // Replace wholesale rather than diffing — the new slot's combo (if
          // any) rarely shares tables with the old one, and this reservation
          // is the only owner of its own ReservationTable rows.
          comboTables: {
            deleteMany: {},
            create: comboTables.map((ct) => ({ tableId: ct.id })),
          },
        },
      });
    });
    emitFloorChange(restaurant.id, "reservation"); // old + new table colours both need to update

    return { ok: true, data: { id: reservationId, date: newDate, time: newTime } };
  } catch (err) {
    if (err instanceof NoAvailabilityError) {
      return { ok: false, error: "That new time isn't available. Ask the guest for a different time." };
    }
    throw err;
  }
}
