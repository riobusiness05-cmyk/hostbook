import { NextRequest, NextResponse } from "next/server";
import { hostContext } from "@/lib/hostflow/apiContext";
import { sendThankYouForReservation } from "@/lib/hostflow/guestEmails";

// Staff said yes: send this booking's guest the thank-you email. Idempotent —
// a second call for the same booking reports "already sent" rather than
// sending twice.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const outcome = await sendThankYouForReservation(ctx.restaurantId, params.id);
  return NextResponse.json(outcome, { status: outcome.sent ? 200 : 409 });
}
