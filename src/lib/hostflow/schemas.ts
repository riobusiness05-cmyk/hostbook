import { z } from "zod";
import { TABLE_STATUSES, WALKIN_PRIORITIES } from "./constants";

export const tableActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("seat"),
    guestName: z.string().trim().min(1).max(120),
    partySize: z.number().int().min(1).max(30),
    source: z.enum(["WALKIN", "RESERVATION"]).default("WALKIN"),
    reservationId: z.string().optional(),
    walkinId: z.string().optional(),
    isVip: z.boolean().optional(),
    occasion: z.string().max(60).optional(),
  }),
  z.object({ action: z.literal("move"), toTableId: z.string().min(1) }),
  z.object({ action: z.literal("merge"), otherTableId: z.string().min(1) }),
  z.object({ action: z.literal("split") }),
  z.object({ action: z.literal("markDirty") }),
  z.object({ action: z.literal("markClean") }),
  z.object({ action: z.literal("release") }),
  z.object({ action: z.literal("block"), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("setStatus"), status: z.enum(TABLE_STATUSES) }),
  z.object({ action: z.literal("waitOutside"), waiting: z.boolean() }),
  z.object({ action: z.literal("setActive"), isActive: z.boolean() }),
  z.object({
    action: z.literal("reposition"),
    x: z.number().min(-2000).max(2000),
    y: z.number().min(-2000).max(2000),
    rotation: z.number().min(0).max(359),
  }),
  z.object({
    action: z.literal("reserve"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    partySize: z.number().int().min(1).max(30),
    customerName: z.string().trim().min(1).max(120),
    customerPhone: z.string().max(40).optional(),
    occasion: z.string().max(60).optional(),
  }),
]);

export type TableAction = z.infer<typeof tableActionSchema>;

export const createWalkinSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().max(40).optional(),
  partySize: z.number().int().min(1).max(30),
  priority: z.enum(WALKIN_PRIORITIES).default("NORMAL"),
  quotedWaitMinutes: z.number().int().min(0).max(240).default(15),
  notes: z.string().max(300).optional(),
  accessibilityNeeds: z.string().max(200).optional(),
});

export const updateWalkinSchema = z.object({
  status: z.enum(["WAITING", "SEATED", "LEFT", "CANCELLED"]).optional(),
  priority: z.enum(WALKIN_PRIORITIES).optional(),
  quotedWaitMinutes: z.number().int().min(0).max(240).optional(),
  notes: z.string().max(300).optional(),
});

export const seatWalkinSchema = z.object({
  tableId: z.string().min(1).optional(), // omit → auto-pick best table
});

export const recommendSchema = z.object({
  partySize: z.number().int().min(1).max(30),
  sectionId: z.string().optional(),
});

export const reservationStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"]),
});

export const settingsSchema = z.object({
  maxBookingsPer15Min: z.number().int().min(1).max(50).optional(),
  bookingIntervalMinutes: z.number().int().min(5).max(120).optional(),
  walkinsEnabled: z.boolean().optional(),
  tableMergingEnabled: z.boolean().optional(),
  walkinAllocationPct: z.number().int().min(0).max(100).optional(),
  avgDiningMinutes: z.number().int().min(30).max(240).optional(),
  cleaningMinutes: z.number().int().min(0).max(60).optional(),
  arrivingSoonThresholdMinutes: z.number().int().min(1).max(120).optional(),
  lateThresholdMinutes: z.number().int().min(1).max(120).optional(),
  noShowThresholdMinutes: z.number().int().min(1).max(120).optional(),
  bookingWindowDays: z.number().int().min(1).max(365).optional(),
  maxOnlinePartySize: z.number().int().min(1).max(30).optional(),
  maxOccupancyPct: z.number().int().min(10).max(100).optional(),
  peakStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  peakEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  nightShiftStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  autoOptimise: z.boolean().optional(),
  aiAssistantEnabled: z.boolean().optional(),
  depositPerPersonCents: z.number().int().min(0).max(100000).nullable().optional(),
  serviceChargePct: z.number().int().min(0).max(100).nullable().optional(),
  cancellationPolicy: z.string().max(2000).nullable().optional(),
});

export const assistantSchema = z.object({
  message: z.string().min(1).max(1000),
  // Recent chat turns, so a booking request split across messages (e.g. the
  // assistant asks "what time?" and the host replies "8pm") still resolves —
  // each request to this endpoint is otherwise stateless.
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) }))
    .max(20)
    .optional(),
});
