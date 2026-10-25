import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { HostFlowError } from "@/lib/hostflow/actions";
import { emitFloorChange } from "@/lib/hostflow/events";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().max(120).nullable().optional(),
  bookableOnline: z.boolean().optional(),
  isOutdoor: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req, { role: "MANAGER" });
  if ("error" in ctx) return ctx.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const section = await prisma.section.findFirst({ where: { id: params.id, restaurantId: ctx.restaurantId } });
    if (!section) throw new HostFlowError("Area not found", 404);
    const data = { ...parsed.data, note: parsed.data.note === "" ? null : parsed.data.note };
    if (data.name && data.name !== section.name) {
      const clash = await prisma.section.findFirst({ where: { restaurantId: ctx.restaurantId, name: data.name, NOT: { id: section.id } } });
      if (clash) throw new HostFlowError("You already have an area with that name.", 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.section.update({ where: { id: section.id }, data });
      // Bookings remember the area by name, and that name is what pins
      // them to it — so a rename carries every upcoming booking along.
      if (data.name && data.name !== section.name) {
        await tx.reservation.updateMany({
          where: { restaurantId: ctx.restaurantId, seatingPreference: section.name, reservationTime: { gte: new Date() } },
          data: { seatingPreference: data.name },
        });
      }
    });
    emitFloorChange(ctx.restaurantId, "table");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}
