import { prisma } from "@/lib/prisma";
import { emitFloorChange } from "./events";
import { getSettings } from "./floor";
import { TableStatus } from "./constants";

// Every function here is a small, auditable state transition. They all:
//   1. mutate the DB,
//   2. append a TableStatusHistory row when a table's status changes,
//   3. optionally raise a Notification,
//   4. emit a realtime floor-change event.
// Keeping this in one module means the API routes stay thin and the AI
// assistant can call exactly the same primitives the UI buttons do.

async function recordStatus(
  restaurantId: string,
  tableId: string,
  toStatus: string,
  note?: string
) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table || table.restaurantId !== restaurantId) throw new HostFlowError("Table not found", 404);
  if (table.status === toStatus) return table;
  const fromStatus = table.status;
  // Conditional on the status still matching what we just read — the same
  // compare-and-swap the seating/merge flows use — so a second transition
  // that raced this one (e.g. a party got seated between the read above and
  // this write) can't silently overwrite it or record a stale `fromStatus`
  // in the audit trail.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.diningTable.updateMany({
      where: { id: tableId, status: fromStatus },
      data: { status: toStatus },
    });
    if (claimed.count === 0) {
      throw new HostFlowError("This table's status just changed — refresh and try again.", 409);
    }
    await tx.tableStatusHistory.create({
      data: { restaurantId, tableId, fromStatus, toStatus, note },
    });
  });
  return table;
}

export class HostFlowError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function notify(
  restaurantId: string,
  data: { type: string; title: string; body?: string; severity?: string; tableId?: string }
) {
  await prisma.notification.create({
    data: {
      restaurantId,
      type: data.type,
      title: data.title,
      body: data.body,
      severity: data.severity ?? "INFO",
      tableId: data.tableId,
    },
  });
}

// ── Table status actions ──────────────────────────────────────────────────

export async function setTableStatus(
  restaurantId: string,
  tableId: string,
  status: TableStatus,
  note?: string
) {
  await recordStatus(restaurantId, tableId, status, note);
  emitFloorChange(restaurantId, "table");
}

export async function markDirty(restaurantId: string, tableId: string) {
  await recordStatus(restaurantId, tableId, "DIRTY");
  const t = await prisma.diningTable.findUnique({ where: { id: tableId } });
  await notify(restaurantId, {
    type: "TABLE_DIRTY",
    title: `Table ${t?.tableNumber} needs cleaning`,
    tableId,
  });
  emitFloorChange(restaurantId, "table");
}

export async function markClean(restaurantId: string, tableId: string) {
  await recordStatus(restaurantId, tableId, "CLEANING");
  emitFloorChange(restaurantId, "table");
}

export async function releaseTable(restaurantId: string, tableId: string) {
  // Free the table for new guests: close any lingering session, clear held
  // reservation link and set AVAILABLE.
  await prisma.tableSession.updateMany({
    where: { tableId, status: "SEATED" },
    data: { status: "FINISHED", finishedAt: new Date() },
  });
  await recordStatus(restaurantId, tableId, "AVAILABLE");
  const t = await prisma.diningTable.findUnique({ where: { id: tableId }, include: { section: true } });
  await notify(restaurantId, {
    type: "TABLE_AVAILABLE",
    title: `Table ${t?.tableNumber} available`,
    tableId,
  });

  // If an outdoor table just freed and parties are waiting at the bar to move
  // outside, alert the host to move the longest-waiting one out.
  if (t?.section?.isOutdoor) {
    const waiting = await prisma.tableSession.findMany({
      where: { restaurantId, status: "SEATED", waitingForOutdoor: true },
      include: { table: true },
      orderBy: { seatedAt: "asc" },
    });
    const fit = waiting.find((w) => w.partySize <= (t.capacityMax ?? 0));
    if (fit) {
      await notify(restaurantId, {
        type: "WAITING_OUTDOOR",
        severity: "WARNING",
        title: `Outdoor Table ${t.tableNumber} is free`,
        body: `${fit.guestName} (${fit.partySize}) at Table ${fit.table.tableNumber} is waiting to move outside`,
        tableId,
      });
    }
  }
  emitFloorChange(restaurantId, "table");
}

// Flag / unflag a seated party as waiting for an outdoor table to eat.
export async function setWaitingForOutdoor(restaurantId: string, tableId: string, waiting: boolean) {
  const session = await prisma.tableSession.findFirst({
    where: { restaurantId, tableId, status: "SEATED" },
  });
  if (!session) throw new HostFlowError("No party is seated at this table");
  await prisma.tableSession.update({
    where: { id: session.id },
    data: { waitingForOutdoor: waiting },
  });
  emitFloorChange(restaurantId, "table");
}

export async function blockTable(restaurantId: string, tableId: string, note?: string) {
  await recordStatus(restaurantId, tableId, "BLOCKED", note);
  emitFloorChange(restaurantId, "table");
}

// Takes a table in/out of service entirely — an inactive table is excluded
// from the floor plan, from `getAvailableSlots`/`findAvailableTable`, and
// from the seating engine, unlike BLOCKED (which is still visible, just
// unusable). Used by the settings page's per-table availability toggle.
export async function setTableActive(restaurantId: string, tableId: string, isActive: boolean) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table || table.restaurantId !== restaurantId) throw new HostFlowError("Table not found", 404);
  await prisma.diningTable.update({ where: { id: tableId }, data: { isActive } });
  emitFloorChange(restaurantId, "table");
}

// Lets a host lay out the floor plan to match their real venue — drag a
// table to reposition it, rotate it to match how it actually sits against a
// wall or in a corner. Purely geometry; never touches status or capacity.
export async function repositionTable(
  restaurantId: string,
  tableId: string,
  params: { x: number; y: number; rotation: number }
) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table || table.restaurantId !== restaurantId) throw new HostFlowError("Table not found", 404);
  await prisma.diningTable.update({
    where: { id: tableId },
    data: { x: params.x, y: params.y, rotation: params.rotation },
  });
  emitFloorChange(restaurantId, "table");
}

// Undoes any drag-to-move/rotate edits by restoring every table's saved
// default position (set when it was seeded or imported) — the fix for a
// floor plan that's drifted into a messy or overlapping state over time.
// Tables with no default (predate this column) are left untouched.
export async function resetFloorPlan(restaurantId: string) {
  const tables = await prisma.diningTable.findMany({
    where: { restaurantId, defaultX: { not: null }, defaultY: { not: null } },
  });
  await Promise.all(
    tables.map((t) =>
      prisma.diningTable.update({
        where: { id: t.id },
        data: { x: t.defaultX!, y: t.defaultY!, rotation: t.defaultRotation ?? 0 },
      })
    )
  );
  emitFloorChange(restaurantId, "table");
  return { count: tables.length };
}

// ── Seating ────────────────────────────────────────────────────────────────

export async function seatParty(
  restaurantId: string,
  params: {
    tableId: string;
    guestName: string;
    partySize: number;
    source?: "WALKIN" | "RESERVATION";
    reservationId?: string;
    walkinId?: string;
    isVip?: boolean;
    occasion?: string;
    durationMinutes?: number;
  }
) {
  const settings = await getSettings(restaurantId);
  const table = await prisma.diningTable.findUnique({ where: { id: params.tableId } });
  if (!table || table.restaurantId !== restaurantId) throw new HostFlowError("Table not found", 404);
  if (table.status === "OCCUPIED") throw new HostFlowError("Table is already occupied");
  if (table.status === "BLOCKED") throw new HostFlowError("Table is blocked");

  const seatedAt = new Date();
  const duration = params.durationMinutes ?? settings.avgDiningMinutes;

  // Two concurrent seat attempts on the same table can both pass the checks
  // above before either write lands — the conditional `updateMany` re-checks
  // status under the row lock at write time, so only one of them can win.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.diningTable.updateMany({
      where: { id: params.tableId, status: { notIn: ["OCCUPIED", "BLOCKED"] } },
      data: { status: "OCCUPIED" },
    });
    if (claimed.count === 0) {
      throw new HostFlowError("Someone just seated this table — pick another.", 409);
    }
    await tx.tableSession.create({
      data: {
        restaurantId,
        tableId: params.tableId,
        guestName: params.guestName,
        partySize: params.partySize,
        status: "SEATED",
        source: params.source ?? "WALKIN",
        seatedAt,
        expectedFinishAt: new Date(seatedAt.getTime() + duration * 60000),
        isVip: params.isVip ?? false,
        occasion: params.occasion,
        serverId: table.serverId,
        reservationId: params.reservationId,
        walkinId: params.walkinId,
      },
    });
    await tx.tableStatusHistory.create({
      data: { restaurantId, tableId: params.tableId, fromStatus: table.status, toStatus: "OCCUPIED" },
    });
  });

  if (params.reservationId) {
    await prisma.reservation.update({
      where: { id: params.reservationId },
      data: { status: "SEATED" },
    });
  }
  if (params.walkinId) {
    await prisma.walkin.update({
      where: { id: params.walkinId },
      data: { status: "SEATED", seatedAt },
    });
  }

  emitFloorChange(restaurantId, "table");
  return { seatedAt };
}

export async function moveParty(restaurantId: string, fromTableId: string, toTableId: string) {
  const [from, to] = await Promise.all([
    prisma.diningTable.findUnique({ where: { id: fromTableId } }),
    prisma.diningTable.findUnique({ where: { id: toTableId }, include: { section: true } }),
  ]);
  if (!from || !to || from.restaurantId !== restaurantId || to.restaurantId !== restaurantId)
    throw new HostFlowError("Table not found", 404);
  const session = await prisma.tableSession.findFirst({
    where: { tableId: fromTableId, status: "SEATED" },
  });
  if (!session) throw new HostFlowError("No party seated at the source table");
  if (to.status === "OCCUPIED" || to.status === "BLOCKED")
    throw new HostFlowError("Destination table is not free");

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.diningTable.updateMany({
      where: { id: toTableId, status: { notIn: ["OCCUPIED", "BLOCKED"] } },
      data: { status: "OCCUPIED" },
    });
    if (claimed.count === 0) {
      throw new HostFlowError("That table was just taken — pick another.", 409);
    }
    const moved = await tx.tableSession.updateMany({
      where: { id: session.id, status: "SEATED" },
      // Moving to an outdoor table fulfils an "waiting for outdoor" request.
      data: { tableId: toTableId, serverId: to.serverId, waitingForOutdoor: to.section?.isOutdoor ? false : session.waitingForOutdoor },
    });
    if (moved.count === 0) {
      throw new HostFlowError("That party already finished or moved — refresh and try again.", 409);
    }
    await tx.diningTable.update({ where: { id: fromTableId }, data: { status: "DIRTY" } });
    await tx.tableStatusHistory.create({
      data: { restaurantId, tableId: toTableId, fromStatus: to.status, toStatus: "OCCUPIED", note: `Moved from T${from.tableNumber}` },
    });
    await tx.tableStatusHistory.create({
      data: { restaurantId, tableId: fromTableId, fromStatus: "OCCUPIED", toStatus: "DIRTY", note: `Moved to T${to.tableNumber}` },
    });
  });
  emitFloorChange(restaurantId, "table");
}

export async function mergeTables(restaurantId: string, primaryId: string, otherId: string) {
  const settings = await getSettings(restaurantId);
  if (!settings.tableMergingEnabled) throw new HostFlowError("Table merging is turned off for this restaurant", 403);
  const [primary, other] = await Promise.all([
    prisma.diningTable.findUnique({ where: { id: primaryId } }),
    prisma.diningTable.findUnique({ where: { id: otherId } }),
  ]);
  if (!primary || !other || primary.restaurantId !== restaurantId || other.restaurantId !== restaurantId)
    throw new HostFlowError("Table not found", 404);
  if (!other.isJoinable) throw new HostFlowError(`Table ${other.tableNumber} can't be joined`);
  if (other.mergedIntoId) throw new HostFlowError(`Table ${other.tableNumber} is already merged into another table`, 409);
  // A table that's itself merged into something else can't act as a primary —
  // otherwise you can end up with a chain (or, if the two merges point at
  // each other, an outright cycle) instead of one flat combined group.
  if (primary.mergedIntoId) throw new HostFlowError(`Table ${primary.tableNumber} is itself merged into another table — split it first`, 409);
  // Never let one booking span two different areas of the restaurant — the
  // same boundary the walk-in auto-combine suggestion (findBestCombo in
  // seating.ts) already respects.
  if (primary.sectionId !== other.sectionId) {
    throw new HostFlowError(`Table ${other.tableNumber} isn't in the same area as Table ${primary.tableNumber} — only tables in the same area can be combined`, 409);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.diningTable.updateMany({
      where: { id: otherId, mergedIntoId: null, isJoinable: true },
      data: { mergedIntoId: primaryId, status: "BLOCKED" },
    });
    if (claimed.count === 0) {
      throw new HostFlowError(`Table ${other.tableNumber} was just merged elsewhere — refresh and try again.`, 409);
    }
    const primaryClaimed = await tx.diningTable.updateMany({
      where: { id: primaryId, capacityMax: primary.capacityMax, mergedIntoId: null },
      data: { capacityMax: primary.capacityMax + other.capacityMax },
    });
    if (primaryClaimed.count === 0) {
      throw new HostFlowError(`Table ${primary.tableNumber} just changed — refresh and try again.`, 409);
    }
    await tx.tableStatusHistory.create({
      data: { restaurantId, tableId: otherId, fromStatus: other.status, toStatus: "BLOCKED", note: `Merged into T${primary.tableNumber}` },
    });
  });
  emitFloorChange(restaurantId, "table");
}

export async function splitTable(restaurantId: string, tableId: string) {
  // Split the given primary table back apart: restore any tables merged into
  // it and recompute the primary's capacity from its merged children.
  const table = await prisma.diningTable.findUnique({
    where: { id: tableId },
    include: { mergedTables: true },
  });
  if (!table || table.restaurantId !== restaurantId) throw new HostFlowError("Table not found", 404);
  if (table.mergedTables.length === 0) throw new HostFlowError("Table has nothing merged into it");

  const restoredCapacity = table.mergedTables.reduce((n, c) => n + c.capacityMax, 0);
  await prisma.$transaction([
    ...table.mergedTables.map((c) =>
      prisma.diningTable.update({ where: { id: c.id }, data: { mergedIntoId: null, status: "AVAILABLE" } })
    ),
    prisma.diningTable.update({
      where: { id: tableId },
      data: { capacityMax: Math.max(table.capacityMin, table.capacityMax - restoredCapacity) },
    }),
  ]);
  emitFloorChange(restaurantId, "table");
}

// Nightly floor reset (see src/app/api/cron/reset-tables/route.ts): undoes
// anything left over from service that a new day shouldn't inherit — tables
// merged for a party that's long gone, and tables staff forgot to release or
// mark clean before closing. A stale RESERVED/LATE display already clears
// itself (getFloorState only surfaces a reservation within a 4h service
// window), so this only needs to touch what actually persists: mergedIntoId
// and table/session status. Safe to run more than once — a clean floor is a
// no-op the second time.
export async function resetDailyFloorState(restaurantId: string) {
  const primaries = await prisma.diningTable.findMany({
    where: { restaurantId, mergedTables: { some: {} } },
    include: { mergedTables: true },
  });
  let split = 0;
  for (const primary of primaries) {
    const restoredCapacity = primary.mergedTables.reduce((n, c) => n + c.capacityMax, 0);
    await prisma.$transaction([
      ...primary.mergedTables.map((c) =>
        prisma.diningTable.update({ where: { id: c.id }, data: { mergedIntoId: null, status: "AVAILABLE" } })
      ),
      prisma.diningTable.update({
        where: { id: primary.id },
        data: { capacityMax: Math.max(primary.capacityMin, primary.capacityMax - restoredCapacity) },
      }),
    ]);
    split += primary.mergedTables.length;
  }

  const stillSeated = await prisma.tableSession.findMany({ where: { restaurantId, status: "SEATED" } });
  for (const s of stillSeated) {
    await prisma.tableSession.update({ where: { id: s.id }, data: { status: "FINISHED", finishedAt: new Date() } });
  }

  // OCCUPIED/DIRTY/CLEANING all mean "not ready for a walk-in", and
  // RESERVED/ARRIVING_SOON/LATE are normally only ever a computed display
  // state (see getFloorState) — but setTableStatus can persist one directly,
  // so this also clears out any that got stuck. BLOCKED is left alone:
  // that's a manual out-of-service flag (e.g. broken furniture), not
  // something a new day fixes on its own.
  const freshened = await prisma.diningTable.updateMany({
    where: { restaurantId, status: { in: ["OCCUPIED", "DIRTY", "CLEANING", "RESERVED", "ARRIVING_SOON", "LATE"] } },
    data: { status: "AVAILABLE" },
  });

  if (split > 0 || freshened.count > 0) emitFloorChange(restaurantId, "table");
  return { tablesSplit: split, tablesFreshened: freshened.count };
}

// ── Walk-ins ────────────────────────────────────────────────────────────────

export async function addWalkin(
  restaurantId: string,
  data: {
    name: string;
    phone?: string;
    partySize: number;
    priority?: string;
    quotedWaitMinutes?: number;
    notes?: string;
    accessibilityNeeds?: string;
  }
) {
  const settings = await getSettings(restaurantId);
  if (!settings.walkinsEnabled) throw new HostFlowError("Walk-ins are turned off for this restaurant", 403);
  const walkin = await prisma.walkin.create({
    data: {
      restaurantId,
      name: data.name,
      phone: data.phone,
      partySize: data.partySize,
      priority: data.priority ?? "NORMAL",
      quotedWaitMinutes: data.quotedWaitMinutes ?? 15,
      notes: data.notes,
      accessibilityNeeds: data.accessibilityNeeds,
    },
  });
  await notify(restaurantId, {
    type: "WALKIN_WAITING",
    title: `Walk-in added: ${data.name} (${data.partySize})`,
    body: `Quoted ${walkin.quotedWaitMinutes} min`,
  });
  emitFloorChange(restaurantId, "walkin");
  return walkin;
}

export async function updateWalkin(
  restaurantId: string,
  walkinId: string,
  data: { status?: string; quotedWaitMinutes?: number; priority?: string; notes?: string }
) {
  const walkin = await prisma.walkin.findUnique({ where: { id: walkinId } });
  if (!walkin || walkin.restaurantId !== restaurantId) throw new HostFlowError("Walk-in not found", 404);
  await prisma.walkin.update({ where: { id: walkinId }, data });
  emitFloorChange(restaurantId, "walkin");
}

// ── Reservations (host-side status flow) ─────────────────────────────────────

export async function updateReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: "CONFIRMED" | "ARRIVED" | "CANCELLED" | "NO_SHOW"
) {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!r || r.restaurantId !== restaurantId) throw new HostFlowError("Reservation not found", 404);
  await prisma.reservation.update({ where: { id: reservationId }, data: { status } });
  // If the held table was reserved/late and the booking is gone, free it.
  if ((status === "CANCELLED" || status === "NO_SHOW") && r.tableId) {
    const t = await prisma.diningTable.findUnique({ where: { id: r.tableId } });
    if (t && (t.status === "RESERVED" || t.status === "LATE" || t.status === "ARRIVING_SOON")) {
      // Best-effort: the reservation itself is already updated above. If
      // someone else changed this table's status in the meantime (e.g. the
      // host manually freed it a moment earlier), recordStatus's optimistic
      // lock rejects the stale write — that's fine, there's nothing left to
      // free, so don't fail the whole request over a side effect that's
      // already moot.
      try {
        await recordStatus(restaurantId, r.tableId, "AVAILABLE", `Reservation ${status.toLowerCase()}`);
      } catch (err) {
        if (!(err instanceof HostFlowError && err.status === 409)) throw err;
      }
    }
  }
  emitFloorChange(restaurantId, "reservation");
}
