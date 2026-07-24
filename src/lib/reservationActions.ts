import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findAvailableTable, combineDateAndTime } from "@/lib/availability";
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

export async function createReservationForRestaurant(
  restaurant: Restaurant,
  input: CreateReservationInput
): Promise<ActionResult<{ id: string; date: string; time: string; partySize: number; tableNumber: number; manageToken: string }>> {
  if (input.partySize > restaurant.maxPartySize) {
    return {
      ok: false,
      error: `Parties larger than ${restaurant.maxPartySize} need to call the restaurant directly to book — I can't auto-book that size.`,
    };
  }

  // Fold the boolean "high chair" request into notes so it travels with the
  // booking and shows up for the host, without needing a dedicated column.
  const noteParts = [input.notes?.trim(), input.highChair ? "High chair requested" : ""].filter(Boolean);
  const manageToken = crypto.randomBytes(24).toString("base64url");

  try {
    const { reservation, table } = await withSerializableRetry(async (tx) => {
      const table = await findAvailableTable({
        restaurant,
        dateStr: input.date,
        time: input.time,
        partySize: input.partySize,
        seatingPreference: input.seatingPreference,
        db: tx,
      });
      if (!table) throw new NoAvailabilityError();

      const reservation = await tx.reservation.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail || null,
          customerPhone: input.customerPhone || null,
          partySize: input.partySize,
          reservationTime: combineDateAndTime(input.date, input.time),
          durationMinutes: restaurant.defaultReservationMinutes,
          status: "CONFIRMED",
          source: input.source,
          notes: noteParts.join(" · ") || null,
          occasion: input.occasion && input.occasion !== "None" ? input.occasion : null,
          seatingPreference:
            input.seatingPreference && input.seatingPreference !== "No preference" ? input.seatingPreference : null,
          accessibilityNeeds: input.accessibilityNeeds?.trim() || null,
          manageToken,
        },
      });
      return { reservation, table };
    });

    return {
      ok: true,
      data: {
        id: reservation.id,
        date: input.date,
        time: input.time,
        partySize: input.partySize,
        tableNumber: table.tableNumber,
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

  return { ok: true, data: { id: reservationId } };
}

export async function rescheduleReservationById(
  restaurant: Restaurant,
  reservationId: string,
  newDate: string,
  newTime: string
): Promise<ActionResult<{ id: string; date: string; time: string }>> {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });

  if (!reservation || reservation.restaurantId !== restaurant.id) {
    return { ok: false, error: "I couldn't find that reservation." };
  }

  try {
    await withSerializableRetry(async (tx) => {
      const table = await findAvailableTable({
        restaurant,
        dateStr: newDate,
        time: newTime,
        partySize: reservation.partySize,
        db: tx,
      });
      if (!table) throw new NoAvailabilityError();

      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          reservationTime: combineDateAndTime(newDate, newTime),
          tableId: table.id,
        },
      });
    });

    return { ok: true, data: { id: reservationId, date: newDate, time: newTime } };
  } catch (err) {
    if (err instanceof NoAvailabilityError) {
      return { ok: false, error: "That new time isn't available. Ask the guest for a different time." };
    }
    throw err;
  }
}
