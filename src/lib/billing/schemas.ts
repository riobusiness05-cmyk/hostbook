import { z } from "zod";

// ── Registration ────────────────────────────────────────────────────────
export const registerSchema = z.object({
  restaurantName: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only")
    .optional(),
  ownerName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

// ── Checkout / portal ──────────────────────────────────────────────────
export const checkoutSchema = z.object({
  planKey: z.string().min(1).max(60).default("professional"),
  interval: z.enum(["MONTH", "YEAR"]).default("MONTH"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ── Platform admin actions ────────────────────────────────────────────────
export const extendTrialSchema = z.object({
  restaurantId: z.string().min(1),
  days: z.number().int().min(1).max(365),
});

export const grantComplimentarySchema = z.object({
  restaurantId: z.string().min(1),
  reason: z.string().max(300).optional(),
});

export const restaurantIdSchema = z.object({
  restaurantId: z.string().min(1),
});
