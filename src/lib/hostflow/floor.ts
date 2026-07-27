import { prisma } from "@/lib/prisma";
import {
  OCCUPIED_STATUSES,
  PRIORITY_WEIGHT,
  TableStatus,
  WalkinPriority,
} from "./constants";

// ── DTOs returned to the client ────────────────────────────────────────────
// These are plain JSON-serialisable shapes (Dates → ISO strings) so they can
// cross the server/client boundary and flow through SSE refetches unchanged.

export type SessionDTO = {
  id: string;
  guestName: string;
  partySize: number;
  seatedAt: string;
  expectedFinishAt: string;
  minutesSeated: number;
  minutesRemaining: number;
  isOverrun: boolean;
  isVip: boolean;
  occasion: string | null;
  currentBill: number | null;
  source: string;
  waitingForOutdoor: boolean;
};

export type ReservationDTO = {
  id: string;
  customerName: string;
  partySize: number;
  reservationTime: string;
  minutesUntil: number; // negative → already late
  isLate: boolean;
  status: string;
  isVip: boolean;
  occasion: string | null;
  seatingPreference: string | null;
  accessibilityNeeds: string | null;
  tableId: string | null;
};

export type TableDTO = {
  id: string;
  tableNumber: number;
  name: string;
  status: TableStatus;
  seatsMin: number;
  seatsMax: number;
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  notes: string | null;
  isJoinable: boolean;
  section: { id: string; name: string; color: string } | null;
  server: { id: string; name: string; color: string } | null;
  session: SessionDTO | null;
  reservation: ReservationDTO | null;
  /** Set when this table is merged into another (the "primary") table. */
  mergedIntoId: string | null;
  /** Day-plan mode only: how many bookings this table has on the viewed date. */
  bookingCount?: number;
};

export type WalkinDTO = {
  id: string;
  name: string;
  phone: string | null;
  partySize: number;
  priority: WalkinPriority;
  quotedWaitMinutes: number;
  notes: string | null;
  accessibilityNeeds: string | null;
  status: string;
  createdAt: string;
  minutesWaiting: number;
};

export type NotificationDTO = {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  tableId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type DashboardMetrics = {
  covers: number;
  occupancyPct: number;
  seatsTotal: number;
  seatsAvailable: number;
  counts: Record<TableStatus, number>;
  lateReservations: number;
  noShows: number; // marked No Show in the last 24h
  walkinsWaiting: number;
  walkinCoversWaiting: number;
  avgQuotedWait: number;
  upcomingArrivals: number; // reservations due within 60 min
  diningPace: number; // tables projected to turn in the next 30 min
  kitchenLoad: number; // 0..100
  serviceHealthScore: number; // 0..100
};

export type RushPoint = { minute: number; label: string; occupancyPct: number };

export type RushPrediction = {
  points: RushPoint[];
  peakLabel: string;
  peakOccupancyPct: number;
  minutesToPeak: number;
  predictedWaitMinutes: number;
};

export type StaffDTO = {
  id: string;
  name: string;
  role: string;
  color: string;
  sectionId: string | null;
  tablesServed: number;
  coversServed: number;
};

export type SectionDTO = {
  id: string;
  name: string;
  color: string;
  isOutdoor: boolean;
  room: string;
  tableCount: number;
  occupiedCount: number;
  availableCount: number;
};

export type WaitingOutdoorDTO = {
  tableId: string;
  tableNumber: number;
  guestName: string;
  partySize: number;
  sectionName: string | null;
  minutesSeated: number;
};

export type FloorState = {
  restaurantId: string;
  generatedAt: string;
  tables: TableDTO[];
  sections: SectionDTO[];
  staff: StaffDTO[];
  walkins: WalkinDTO[];
  reservations: ReservationDTO[]; // upcoming + late, not yet seated
  waitingToMoveOutside: WaitingOutdoorDTO[];
  notifications: NotificationDTO[];
  metrics: DashboardMetrics;
  rush: RushPrediction;
  settings: SettingsDTO;
};

export type SettingsDTO = {
  maxBookingsPer15Min: number;
  walkinAllocationPct: number;
  avgDiningMinutes: number;
  cleaningMinutes: number;
  arrivingSoonThresholdMinutes: number;
  lateThresholdMinutes: number;
  noShowThresholdMinutes: number;
  bookingWindowDays: number;
  maxOnlinePartySize: number;
  maxOccupancyPct: number;
  peakStart: string;
  peakEnd: string;
  nightShiftStartTime: string;
  autoOptimise: boolean;
  aiAssistantEnabled: boolean;
  depositPerPersonCents: number | null;
  serviceChargePct: number | null;
  cancellationPolicy: string | null;
};

const minutesBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60000);

export async function getSettings(restaurantId: string): Promise<SettingsDTO> {
  const s =
    (await prisma.restaurantSettings.findUnique({ where: { restaurantId } })) ??
    (await prisma.restaurantSettings.create({ data: { restaurantId } }));
  return {
    maxBookingsPer15Min: s.maxBookingsPer15Min,
    walkinAllocationPct: s.walkinAllocationPct,
    avgDiningMinutes: s.avgDiningMinutes,
    cleaningMinutes: s.cleaningMinutes,
    arrivingSoonThresholdMinutes: s.arrivingSoonThresholdMinutes,
    lateThresholdMinutes: s.lateThresholdMinutes,
    noShowThresholdMinutes: s.noShowThresholdMinutes,
    bookingWindowDays: s.bookingWindowDays,
    maxOnlinePartySize: s.maxOnlinePartySize,
    maxOccupancyPct: s.maxOccupancyPct,
    peakStart: s.peakStart,
    peakEnd: s.peakEnd,
    nightShiftStartTime: s.nightShiftStartTime,
    autoOptimise: s.autoOptimise,
    aiAssistantEnabled: s.aiAssistantEnabled,
    depositPerPersonCents: s.depositPerPersonCents,
    serviceChargePct: s.serviceChargePct,
    cancellationPolicy: s.cancellationPolicy,
  };
}

/**
 * The single source of truth for the live floor. One batched read, then all
 * derivation happens in-memory. Everything the host dashboard, floor plan,
 * waitlist and AI assistant render is computed here so those surfaces can
 * never disagree with each other.
 */
export async function getFloorState(restaurantId: string): Promise<FloorState> {
  const nowDate = new Date();
  const settings = await getSettings(restaurantId);

  const [tables, sessions, reservations, walkins, notifications, sections, staff, noShowCount] = await Promise.all([
    prisma.diningTable.findMany({
      where: { restaurantId, isActive: true },
      include: { section: true, server: true },
      orderBy: { tableNumber: "asc" },
    }),
    prisma.tableSession.findMany({
      where: { restaurantId, status: "SEATED" },
    }),
    prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: ["PENDING", "CONFIRMED", "ARRIVED"] },
        // From 3h ago (to catch late arrivals) out to 30 days ahead, so the
        // Bookings tab shows future reservations too.
        reservationTime: {
          gte: new Date(nowDate.getTime() - 3 * 60 * 60000),
          lte: new Date(nowDate.getTime() + 30 * 24 * 60 * 60000),
        },
      },
      orderBy: { reservationTime: "asc" },
    }),
    prisma.walkin.findMany({
      where: { restaurantId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.section.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" } }),
    prisma.staffMember.findMany({ where: { restaurantId, isActive: true }, orderBy: { name: "asc" } }),
    // No-shows marked in the last 24h — a rolling window rather than
    // calendar-day-in-restaurant-timezone, since this is a glance stat, not
    // a billing cutoff.
    prisma.reservation.count({
      where: {
        restaurantId,
        status: "NO_SHOW",
        reservationTime: { gte: new Date(nowDate.getTime() - 24 * 60 * 60000) },
      },
    }),
  ]);

  const sessionByTable = new Map(sessions.map((s) => [s.tableId, s]));
  // Reservation to surface on a held table: the soonest upcoming/late one, but
  // only within the current service window (next 4h) so a booking made for a
  // future date doesn't paint an otherwise-free table as reserved right now.
  const serviceWindowMs = 4 * 60 * 60000;
  const reservationByTable = new Map<string, (typeof reservations)[number]>();
  for (const r of reservations) {
    if (!r.tableId) continue;
    if (r.reservationTime.getTime() > nowDate.getTime() + serviceWindowMs) continue;
    if (!reservationByTable.has(r.tableId)) reservationByTable.set(r.tableId, r);
  }

  const toReservationDTO = (r: (typeof reservations)[number]): ReservationDTO => {
    const minutesUntil = minutesBetween(r.reservationTime, nowDate);
    return {
      id: r.id,
      customerName: r.customerName,
      partySize: r.partySize,
      reservationTime: r.reservationTime.toISOString(),
      minutesUntil,
      isLate: minutesUntil < -settings.lateThresholdMinutes,
      status: r.status,
      isVip: r.isVip,
      occasion: r.occasion,
      seatingPreference: r.seatingPreference,
      accessibilityNeeds: r.accessibilityNeeds,
      tableId: r.tableId,
    };
  };

  const tableDTOs: TableDTO[] = tables.map((t) => {
    const s = sessionByTable.get(t.id);
    const r = reservationByTable.get(t.id);
    const session: SessionDTO | null = s
      ? {
          id: s.id,
          guestName: s.guestName,
          partySize: s.partySize,
          seatedAt: s.seatedAt.toISOString(),
          expectedFinishAt: s.expectedFinishAt.toISOString(),
          minutesSeated: minutesBetween(nowDate, s.seatedAt),
          minutesRemaining: minutesBetween(s.expectedFinishAt, nowDate),
          isOverrun: s.expectedFinishAt.getTime() < nowDate.getTime(),
          isVip: s.isVip,
          occasion: s.occasion,
          currentBill: s.currentBill,
          source: s.source,
          waitingForOutdoor: s.waitingForOutdoor,
        }
      : null;
    const reservation = r ? toReservationDTO(r) : null;

    // A table sitting on the stored AVAILABLE status with an upcoming
    // reservation should read as reserved on the floor, not free — this is
    // what makes booking a table visibly change its colour instead of
    // silently leaving it green until a host manually seats it later.
    // Never overrides a real operational state (OCCUPIED/DIRTY/BLOCKED/etc.)
    // — only steps in when the table would otherwise show as free.
    // Thresholds are per-restaurant settings (General tab): defaults are
    // "arriving soon" at 5 min out, "late" 15 min after the booked time.
    let status = t.status as TableStatus;
    if (status === "AVAILABLE" && reservation) {
      status = reservation.isLate
        ? "LATE"
        : reservation.minutesUntil <= settings.arrivingSoonThresholdMinutes
        ? "ARRIVING_SOON"
        : "RESERVED";
    }

    return {
      id: t.id,
      tableNumber: t.tableNumber,
      name: t.name,
      status,
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
      session,
      reservation,
      mergedIntoId: t.mergedIntoId,
    };
  });

  // ── Metrics ───────────────────────────────────────────────────────────
  const counts = TABLE_COUNTS(tableDTOs);
  const seatsTotal = tableDTOs.reduce((n, t) => n + t.seatsMax, 0);
  const occupiedSeats = sessions.reduce((n, s) => n + s.partySize, 0);
  const seatsHeldOrOccupied = tableDTOs
    .filter((t) => OCCUPIED_STATUSES.includes(t.status))
    .reduce((n, t) => n + t.seatsMax, 0);
  const seatsAvailable = tableDTOs
    .filter((t) => t.status === "AVAILABLE")
    .reduce((n, t) => n + t.seatsMax, 0);

  const walkinDTOs: WalkinDTO[] = sortWaitlist(
    walkins.map((w) => ({
      id: w.id,
      name: w.name,
      phone: w.phone,
      partySize: w.partySize,
      priority: w.priority as WalkinPriority,
      quotedWaitMinutes: w.quotedWaitMinutes,
      notes: w.notes,
      accessibilityNeeds: w.accessibilityNeeds,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      minutesWaiting: minutesBetween(nowDate, w.createdAt),
    }))
  );

  const upcomingReservationDTOs = reservations.map(toReservationDTO);
  const lateReservations = upcomingReservationDTOs.filter((r) => r.isLate).length;
  const upcomingArrivals = upcomingReservationDTOs.filter(
    (r) => r.minutesUntil >= 0 && r.minutesUntil <= 60
  ).length;

  const avgQuotedWait =
    walkinDTOs.length > 0
      ? Math.round(walkinDTOs.reduce((n, w) => n + w.quotedWaitMinutes, 0) / walkinDTOs.length)
      : 0;

  // Tables projected to free up within 30 minutes (dining pace).
  const diningPace = tableDTOs.filter(
    (t) => t.session && t.session.minutesRemaining <= 30
  ).length;

  const occupancyPct = seatsTotal > 0 ? Math.round((seatsHeldOrOccupied / seatsTotal) * 100) : 0;

  // Kitchen load: active covers + covers arriving in next 30 min, scaled
  // against a nominal per-service capacity (seatsTotal is a reasonable proxy
  // for how many plates the line can carry at once).
  const arrivingCovers = upcomingReservationDTOs
    .filter((r) => r.minutesUntil >= 0 && r.minutesUntil <= 30)
    .reduce((n, r) => n + r.partySize, 0);
  const kitchenLoad = Math.min(
    100,
    Math.round(((occupiedSeats + arrivingCovers) / Math.max(1, seatsTotal * 0.85)) * 100)
  );

  const rush = predictRush(tableDTOs, upcomingReservationDTOs, walkinDTOs, settings, nowDate);

  const serviceHealthScore = computeServiceHealth({
    occupancyPct,
    maxOccupancyPct: settings.maxOccupancyPct,
    lateReservations,
    dirtyTables: counts.DIRTY + counts.CLEANING,
    walkinsWaiting: walkinDTOs.length,
    avgQuotedWait,
    kitchenLoad,
    overrunTables: tableDTOs.filter((t) => t.session?.isOverrun).length,
  });

  const metrics: DashboardMetrics = {
    covers: occupiedSeats,
    occupancyPct,
    seatsTotal,
    seatsAvailable,
    counts,
    lateReservations,
    noShows: noShowCount,
    walkinsWaiting: walkinDTOs.length,
    walkinCoversWaiting: walkinDTOs.reduce((n, w) => n + w.partySize, 0),
    avgQuotedWait,
    upcomingArrivals,
    diningPace,
    kitchenLoad,
    serviceHealthScore,
  };

  // ── Sections & staff rollups ──────────────────────────────────────────
  const sectionDTOs: SectionDTO[] = sections.map((sec) => {
    const secTables = tableDTOs.filter((t) => t.section?.id === sec.id);
    return {
      id: sec.id,
      name: sec.name,
      color: sec.color,
      isOutdoor: sec.isOutdoor,
      room: sec.room,
      tableCount: secTables.length,
      occupiedCount: secTables.filter((t) => OCCUPIED_STATUSES.includes(t.status)).length,
      availableCount: secTables.filter((t) => t.status === "AVAILABLE").length,
    };
  });

  // Parties seated (usually at the bar) waiting for an outdoor table to eat,
  // longest-waiting first — the host's "who moves outside next" queue.
  const waitingToMoveOutside: WaitingOutdoorDTO[] = tableDTOs
    .filter((t) => t.session?.waitingForOutdoor)
    .map((t) => ({
      tableId: t.id,
      tableNumber: t.tableNumber,
      guestName: t.session!.guestName,
      partySize: t.session!.partySize,
      sectionName: t.section?.name ?? null,
      minutesSeated: t.session!.minutesSeated,
    }))
    .sort((a, b) => b.minutesSeated - a.minutesSeated);

  const staffDTOs: StaffDTO[] = staff.map((m) => {
    const served = tableDTOs.filter((t) => t.server?.id === m.id && t.session);
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      color: m.color,
      sectionId: m.sectionId,
      tablesServed: served.length,
      coversServed: served.reduce((n, t) => n + (t.session?.partySize ?? 0), 0),
    };
  });

  const notificationDTOs: NotificationDTO[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body,
    tableId: n.tableId,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return {
    restaurantId,
    generatedAt: nowDate.toISOString(),
    tables: tableDTOs,
    sections: sectionDTOs,
    staff: staffDTOs,
    walkins: walkinDTOs,
    reservations: upcomingReservationDTOs,
    waitingToMoveOutside,
    notifications: notificationDTOs,
    metrics,
    rush,
    settings,
  };
}

function TABLE_COUNTS(tables: TableDTO[]): Record<TableStatus, number> {
  const counts = {
    AVAILABLE: 0,
    OCCUPIED: 0,
    RESERVED: 0,
    ARRIVING_SOON: 0,
    LATE: 0,
    DIRTY: 0,
    CLEANING: 0,
    BLOCKED: 0,
  } as Record<TableStatus, number>;
  for (const t of tables) counts[t.status]++;
  return counts;
}

// ── Waitlist sorting ────────────────────────────────────────────────────
// Sort order per the brief: priority/VIP first, then accessibility needs,
// then longest waiting. Party size is a gentle tie-breaker (seat smaller
// parties sooner when everything else is equal — they fit more openings).
export function sortWaitlist(list: WalkinDTO[]): WalkinDTO[] {
  return [...list].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pw !== 0) return pw;
    const acc = Number(!!b.accessibilityNeeds) - Number(!!a.accessibilityNeeds);
    if (acc !== 0) return acc;
    if (b.minutesWaiting !== a.minutesWaiting) return b.minutesWaiting - a.minutesWaiting;
    return a.partySize - b.partySize;
  });
}

// ── Rush prediction ─────────────────────────────────────────────────────
// Projects seat occupancy over the next 2 hours in 15-minute steps by
// walking currently-seated parties out at their expected finish, and walking
// upcoming reservations + waitlisted walk-ins in at their arrival, holding
// each for the configured average dining time.
export function predictRush(
  tables: TableDTO[],
  reservations: ReservationDTO[],
  walkins: WalkinDTO[],
  settings: SettingsDTO,
  now: Date
): RushPrediction {
  const seatsTotal = Math.max(1, tables.reduce((n, t) => n + t.seatsMax, 0));
  const horizon = 120;
  const step = 15;

  // Baseline: seats currently occupied and when each frees up.
  const occupied = tables
    .filter((t) => t.session)
    .map((t) => ({ seats: t.session!.partySize, until: t.session!.minutesRemaining }));

  // Expected inflow: reservations (by minutesUntil) + waitlist walk-ins
  // (assumed seated around their quoted wait).
  const inflow = [
    ...reservations
      .filter((r) => r.minutesUntil >= 0)
      .map((r) => ({ seats: r.partySize, at: r.minutesUntil })),
    ...walkins.map((w) => ({ seats: w.partySize, at: Math.max(0, w.quotedWaitMinutes - w.minutesWaiting) })),
  ];

  const points: RushPoint[] = [];
  let peak = { minute: 0, occupancyPct: 0 };

  for (let m = 0; m <= horizon; m += step) {
    const stillSeated = occupied
      .filter((o) => o.until > m)
      .reduce((n, o) => n + o.seats, 0);
    const arrived = inflow
      .filter((i) => i.at <= m && i.at + settings.avgDiningMinutes > m)
      .reduce((n, i) => n + i.seats, 0);
    const occupancyPct = Math.min(100, Math.round(((stillSeated + arrived) / seatsTotal) * 100));
    const at = new Date(now.getTime() + m * 60000);
    const label = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    points.push({ minute: m, label, occupancyPct });
    if (occupancyPct > peak.occupancyPct) peak = { minute: m, occupancyPct };
  }

  // Predicted wait: if peak exceeds capacity, roughly how long until a table
  // frees, scaled by how far over capacity we go.
  const over = Math.max(0, peak.occupancyPct - settings.maxOccupancyPct);
  const predictedWaitMinutes = over > 0 ? Math.round((over / 100) * settings.avgDiningMinutes) : 0;

  const peakAt = new Date(now.getTime() + peak.minute * 60000);
  return {
    points,
    peakLabel: peakAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    peakOccupancyPct: peak.occupancyPct,
    minutesToPeak: peak.minute,
    predictedWaitMinutes,
  };
}

// ── Service health score ────────────────────────────────────────────────
// A single 0..100 gauge the host can glance at. Starts at 100 and deducts
// for the things that actually stress a service: overcrowding, late tables,
// unbussed tables, a long walk-in queue, an overloaded kitchen and tables
// running past their dining window.
function computeServiceHealth(i: {
  occupancyPct: number;
  maxOccupancyPct: number;
  lateReservations: number;
  dirtyTables: number;
  walkinsWaiting: number;
  avgQuotedWait: number;
  kitchenLoad: number;
  overrunTables: number;
}): number {
  let score = 100;
  score -= Math.max(0, i.occupancyPct - i.maxOccupancyPct) * 0.8;
  score -= i.lateReservations * 6;
  score -= i.dirtyTables * 4;
  score -= Math.max(0, i.walkinsWaiting - 2) * 3;
  score -= Math.max(0, i.avgQuotedWait - 20) * 0.5;
  score -= Math.max(0, i.kitchenLoad - 85) * 0.6;
  score -= i.overrunTables * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}
