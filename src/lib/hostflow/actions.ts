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
  await prisma.$transaction([
    prisma.diningTable.update({ where: { id: tableId }, data: { status: toStatus } }),
    prisma.tableStatusHistory.create({
      data: { restaurantId, tableId, fromStatus: table.status, toStatus, note },
    }),
  ]);
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

  await prisma.$transaction([
    prisma.tableSession.create({
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
    }),
    prisma.diningTable.update({ where: { id: params.tableId }, data: { status: "OCCUPIED" } }),
    prisma.tableStatusHistory.create({
      data: { restaurantId, tableId: params.tableId, fromStatus: table.status, toStatus: "OCCUPIED" },
    }),
  ]);

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

  await prisma.$transaction([
    prisma.tableSession.update({
      where: { id: session.id },
      // Moving to an outdoor table fulfils an "waiting for outdoor" request.
      data: { tableId: toTableId, serverId: to.serverId, waitingForOutdoor: to.section?.isOutdoor ? false : session.waitingForOutdoor },
    }),
    prisma.diningTable.update({ where: { id: toTableId }, data: { status: "OCCUPIED" } }),
    prisma.diningTable.update({ where: { id: fromTableId }, data: { status: "DIRTY" } }),
    prisma.tableStatusHistory.create({
      data: { restaurantId, tableId: toTableId, fromStatus: to.status, toStatus: "OCCUPIED", note: `Moved from T${from.tableNumber}` },
    }),
    prisma.tableStatusHistory.create({
      data: { restaurantId, tableId: fromTableId, fromStatus: "OCCUPIED", toStatus: "DIRTY", note: `Moved to T${to.tableNumber}` },
    }),
  ]);
  emitFloorChange(restaurantId, "table");
}

export async function mergeTables(restaurantId: string, primaryId: string, otherId: string) {
  const [primary, other] = await Promise.all([
    prisma.diningTable.findUnique({ where: { id: primaryId } }),
    prisma.diningTable.findUnique({ where: { id: otherId } }),
  ]);
  if (!primary || !other || primary.restaurantId !== restaurantId || other.restaurantId !== restaurantId)
    throw new HostFlowError("Table not found", 404);
  if (!other.isJoinable) throw new HostFlowError(`Table ${other.tableNumber} can't be joined`);

  await prisma.$transaction([
    prisma.diningTable.update({ where: { id: otherId }, data: { mergedIntoId: primaryId, status: "BLOCKED" } }),
    prisma.diningTable.update({
      where: { id: primaryId },
      data: { capacityMax: primary.capacityMax + other.capacityMax },
    }),
    prisma.tableStatusHistory.create({
      data: { restaurantId, tableId: otherId, fromStatus: other.status, toStatus: "BLOCKED", note: `Merged into T${primary.tableNumber}` },
    }),
  ]);
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
      await recordStatus(restaurantId, r.tableId, "AVAILABLE", `Reservation ${status.toLowerCase()}`);
    }
  }
  emitFloorChange(restaurantId, "reservation");
}
