import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Vercel's serverless functions don't share memory across instances, so an
// in-memory counter isn't a real rate limit — it just resets per cold start.
// This uses the existing Postgres connection as a fixed-window counter
// instead of standing up a separate Redis/Upstash service for it.

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function checkRateLimit(
  key: string,
  windowMs: number,
  max: number
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const hit = await prisma.rateLimitHit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  // Best-effort, low-probability cleanup of old windows — cheap enough to
  // run inline instead of needing a separate cron just to stop this table
  // growing forever.
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - windowMs * 10);
    prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => {});
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000));
  return { limited: hit.count > max, retryAfterSeconds };
}
