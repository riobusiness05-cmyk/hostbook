import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { validateTemplate } from "@/lib/emailTemplate";

// A venue's bespoke thank-you template — read, save, or clear. Platform
// admin only: venues see the result in their Brand kit preview but never
// edit the HTML themselves.

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { thankYouEmailHtml: true } });
  return NextResponse.json({ html: settings?.thankYouEmailHtml ?? null });
}

const saveSchema = z.object({ restaurantId: z.string().min(1), html: z.string().max(200_000) });

export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const problems = validateTemplate(parsed.data.html);
  if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 422 });
  await prisma.restaurantSettings.upsert({
    where: { restaurantId: parsed.data.restaurantId },
    create: { restaurantId: parsed.data.restaurantId, thankYouEmailHtml: parsed.data.html },
    update: { thankYouEmailHtml: parsed.data.html },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  await prisma.restaurantSettings.updateMany({ where: { restaurantId }, data: { thankYouEmailHtml: null } });
  return NextResponse.json({ ok: true });
}
