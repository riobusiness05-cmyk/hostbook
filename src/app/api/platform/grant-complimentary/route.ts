import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { grantComplimentarySchema } from "@/lib/billing/schemas";
import { grantComplimentary } from "@/lib/billing/subscription";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = grantComplimentarySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await grantComplimentary(parsed.data.restaurantId, {
    reason: parsed.data.reason,
    grantedBy: process.env.ADMIN_EMAIL,
  });
  return NextResponse.json({ ok: true });
}
