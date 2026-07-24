import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { reservationStatusSchema } from "@/lib/hostflow/schemas";
import { updateReservationStatus } from "@/lib/hostflow/actions";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  const parsed = reservationStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  try {
    await updateReservationStatus(ctx.restaurantId, params.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleActionError(err);
  }
}
