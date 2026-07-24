import { z } from "zod";

export const dateStrSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const timeStrSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM 24h format");

export const availabilityQuerySchema = z.object({
  date: dateStrSchema,
  partySize: z.coerce.number().int().min(1).max(30),
});

// The Colonial's actual seating areas — a guest can request a specific one and
// the table-assignment engine will prefer a free table in that area.
export const SEATING_PREFERENCES = [
  "No preference",
  "Main Terrace",
  "Back Terrace",
  "Restaurant",
  "Bar",
  "Lounge",
] as const;
export const OCCASIONS = ["None", "Birthday", "Anniversary", "Business", "Celebration", "Date night"] as const;

export const createReservationSchema = z.object({
  date: dateStrSchema,
  time: timeStrSchema,
  partySize: z.number().int().min(1).max(30),
  customerName: z.string().min(1).max(120),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().min(3).max(40).optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
  // Richer guest context — all optional so existing callers (chat) still work.
  occasion: z.enum(OCCASIONS).optional(),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
  accessibilityNeeds: z.string().max(200).optional(),
  highChair: z.boolean().optional(),
  source: z.enum(["WEB_CHAT", "WEB_FORM", "PHONE", "ADMIN"]).default("WEB_FORM"),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  date: dateStrSchema.optional(),
  time: timeStrSchema.optional(),
  partySize: z.number().int().min(1).max(30).optional(),
  notes: z.string().max(500).optional(),
});

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;
