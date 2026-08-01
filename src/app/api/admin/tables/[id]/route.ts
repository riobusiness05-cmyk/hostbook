import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminGuard";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  capacityMin: z.number().int().min(1).optional(),
  capacityMax: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }
  const table = await prisma.diningTable.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ table });
}

// Deleting a table is destructive: it cascades away the table's
// TableSession history (real dining records) and, for any reservation still
// pointing at it, silently nulls out the table assignment. So this: (1)
// refuses outright if there's a real live booking or party in progress —
// that has to be resolved by hand, not clicked through — and (2) otherwise
// still requires an explicit confirmation from the caller.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const confirmed = (body as { confirm?: boolean })?.confirm === true;

  const table = await prisma.diningTable.findUnique({ where: { id: params.id } });
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const [upcomingBookings, liveSession] = await Promise.all([
    prisma.reservation.count({
      where: { tableId: params.id, status: { in: ["PENDING", "CONFIRMED", "ARRIVED"] } },
    }),
    prisma.tableSession.findFirst({ where: { tableId: params.id, status: "SEATED" } }),
  ]);

  if (upcomingBookings > 0) {
    return NextResponse.json(
      {
        error: `Table ${table.name} has ${upcomingBookings} upcoming booking${upcomingBookings === 1 ? "" : "s"} — cancel or reassign ${upcomingBookings === 1 ? "it" : "them"} first.`,
      },
      { status: 409 }
    );
  }
  if (liveSession) {
    return NextResponse.json({ error: `Table ${table.name} currently has guests seated — release it first.` }, { status: 409 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Deleting a table can't be undone — confirmation required.", requiresConfirmation: true }, { status: 409 });
  }

  await prisma.diningTable.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
