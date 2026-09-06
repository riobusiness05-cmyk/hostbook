import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";

const bodySchema = z.object({ body: z.string().trim().min(1).max(1000) });

// Adds a shift-handoff note to a reservation — internal staff-to-staff, never
// shown to the guest. Attributed to the logged-in account, with the name
// copied onto the row so the note still reads sensibly if that account is
// later removed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Write a note first." }, { status: 400 });
  }

  try {
    // Scoped to this restaurant — a reservation id from another venue must
    // never be writable through this venue's session.
    const reservation = await prisma.reservation.findFirst({
      where: { id: params.id, restaurantId: ctx.restaurantId },
      select: { id: true },
    });
    if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

    const account = await prisma.account.findUnique({
      where: { id: ctx.accountId },
      select: { name: true },
    });

    const comment = await prisma.reservationComment.create({
      data: {
        reservationId: reservation.id,
        accountId: ctx.accountId,
        authorName: account?.name ?? "Staff",
        body: parsed.data.body,
      },
    });

    return NextResponse.json({
      ok: true,
      comment: {
        id: comment.id,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return handleActionError(err);
  }
}
