import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { tableActionSchema } from "@/lib/hostflow/schemas";
import {
  blockTable,
  markClean,
  markDirty,
  mergeTables,
  moveParty,
  releaseTable,
  seatParty,
  setTableStatus,
  setWaitingForOutdoor,
  splitTable,
} from "@/lib/hostflow/actions";

// One endpoint dispatches every table action so the UI has a single, typed
// surface. The body is a discriminated union validated by Zod.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => null);
  const parsed = tableActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action", details: parsed.error.flatten() }, { status: 400 });
  }
  const a = parsed.data;
  const tableId = params.id;

  try {
    switch (a.action) {
      case "seat":
        await seatParty(ctx.restaurantId, {
          tableId,
          guestName: a.guestName,
          partySize: a.partySize,
          source: a.source,
          reservationId: a.reservationId,
          walkinId: a.walkinId,
          isVip: a.isVip,
          occasion: a.occasion,
        });
        break;
      case "move":
        await moveParty(ctx.restaurantId, tableId, a.toTableId);
        break;
      case "merge":
        await mergeTables(ctx.restaurantId, tableId, a.otherTableId);
        break;
      case "split":
        await splitTable(ctx.restaurantId, tableId);
        break;
      case "markDirty":
        await markDirty(ctx.restaurantId, tableId);
        break;
      case "markClean":
        await markClean(ctx.restaurantId, tableId);
        break;
      case "release":
        await releaseTable(ctx.restaurantId, tableId);
        break;
      case "block":
        await blockTable(ctx.restaurantId, tableId, a.note);
        break;
      case "setStatus":
        await setTableStatus(ctx.restaurantId, tableId, a.status);
        break;
      case "waitOutside":
        await setWaitingForOutdoor(ctx.restaurantId, tableId, a.waiting);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}
