import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hostContext } from "@/lib/hostflow/apiContext";
import { OUTCOME_TEXT, renderThankYouForVisit, sendThankYouForVisit } from "@/lib/hostflow/guestEmails";

// The thank-you for one visit. GET = the exact email as it would go
// (Preview in the release modal); POST = staff said yes, send it. `email`
// adds an address to a visit that has none (walk-ins, phone bookings).

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const email = new URL(req.url).searchParams.get("email");
  const rendered = await renderThankYouForVisit(ctx.restaurantId, params.id, email);
  if (!rendered) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  return new NextResponse(rendered.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const bodySchema = z.object({ email: z.string().trim().email().optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const parsed = bodySchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  const outcome = await sendThankYouForVisit(ctx.restaurantId, params.id, { email: parsed.data.email });
  if (outcome.sent) return NextResponse.json(outcome);
  return NextResponse.json({ ...outcome, message: outcome.detail ?? OUTCOME_TEXT[outcome.reason] }, { status: 409 });
}
