import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { restaurantIdSchema } from "@/lib/billing/schemas";
import { convertComplimentaryToPaid } from "@/lib/billing/subscription";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = restaurantIdSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await convertComplimentaryToPaid(parsed.data.restaurantId);
  return NextResponse.json({ ok: true });
}
