import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { emitFloorChange } from "@/lib/hostflow/events";

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const notifications = await prisma.notification.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ notifications });
}

const patchSchema = z.object({
  id: z.string().optional(), // omit → mark all read
  isRead: z.boolean().default(true),
});

export async function PATCH(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (parsed.data.id) {
    await prisma.notification.updateMany({
      where: { id: parsed.data.id, restaurantId: ctx.restaurantId },
      data: { isRead: parsed.data.isRead },
    });
  } else {
    await prisma.notification.updateMany({
      where: { restaurantId: ctx.restaurantId, isRead: false },
      data: { isRead: true },
    });
  }
  emitFloorChange(ctx.restaurantId, "notification");
  return NextResponse.json({ ok: true });
}
