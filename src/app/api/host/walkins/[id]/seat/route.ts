import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { seatWalkinSchema } from "@/lib/hostflow/schemas";
import { seatParty, mergeTables, HostFlowError } from "@/lib/hostflow/actions";
import { getFloorState } from "@/lib/hostflow/floor";
import { recommendSeating } from "@/lib/hostflow/seating";

// Seat a waitlisted walk-in — at an explicit table, or let the seating
// engine pick the best free table for the party.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const parsed = seatWalkinSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const walkin = await prisma.walkin.findUnique({ where: { id: params.id } });
    if (!walkin || walkin.restaurantId !== ctx.restaurantId) throw new HostFlowError("Walk-in not found", 404);
    if (walkin.status !== "WAITING") throw new HostFlowError("Walk-in is no longer waiting");

    let tableId = parsed.data.tableId;
    if (!tableId) {
      const state = await getFloorState(ctx.restaurantId);
      const rec = recommendSeating(state, walkin.partySize);
      if (rec.best) {
        tableId = rec.best.tableId;
      } else if (rec.combo) {
        // No single table fits — push the two suggested tables together and
        // seat the party at the resulting merged table, instead of leaving
        // the host to do it as two separate manual steps.
        const [primaryId, otherId] = rec.combo.tableIds;
        await mergeTables(ctx.restaurantId, primaryId, otherId);
        tableId = primaryId;
      } else {
        throw new HostFlowError(rec.message, 409);
      }
    }

    await seatParty(ctx.restaurantId, {
      tableId,
      guestName: walkin.name,
      partySize: walkin.partySize,
      source: "WALKIN",
      walkinId: walkin.id,
      isVip: walkin.priority === "VIP",
    });
    return NextResponse.json({ ok: true, tableId });
  } catch (err) {
    return handleActionError(err);
  }
}
