import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Per-venue ceilings on endpoints that cost real money per call (AI) or
 * send mail. A legitimate venue never gets near these; a self-serve trial
 * account looping the endpoint does. Returns a ready 429 or null.
 */
export async function venueQuota(
  restaurantId: string,
  kind: "ai-assistant" | "ai-vision" | "email-test" | "email-visit",
): Promise<NextResponse | null> {
  const limits: Record<typeof kind, { windowMs: number; max: number; what: string }> = {
    "ai-assistant": { windowMs: 60 * 60 * 1000, max: 60, what: "assistant messages" },
    "ai-vision": { windowMs: 24 * 60 * 60 * 1000, max: 10, what: "floor-plan scans" },
    "email-test": { windowMs: 60 * 60 * 1000, max: 10, what: "test emails" },
    "email-visit": { windowMs: 60 * 60 * 1000, max: 60, what: "thank-you emails" },
  };
  const { windowMs, max, what } = limits[kind];
  const rl = await checkRateLimit(`quota:${kind}:${restaurantId}`, windowMs, max);
  if (!rl.limited) return null;
  return NextResponse.json(
    { error: `You've hit the limit for ${what} for now. Try again in a while.` },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
  );
}
