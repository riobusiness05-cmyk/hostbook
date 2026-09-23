import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { deletePublicFile } from "@/lib/storage";

const patchSchema = z.object({ alt: z.string().trim().max(160).nullable().optional(), sortOrder: z.number().int().min(0).max(20).optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const asset = await prisma.brandAsset.findUnique({ where: { id: params.id } });
  if (!asset || asset.restaurantId !== ctx.restaurantId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.brandAsset.update({ where: { id: asset.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const asset = await prisma.brandAsset.findUnique({ where: { id: params.id } });
  if (!asset || asset.restaurantId !== ctx.restaurantId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deletePublicFile(asset.url);
  await prisma.brandAsset.delete({ where: { id: asset.id } });
  if (asset.kind === "LOGO") await prisma.restaurant.update({ where: { id: ctx.restaurantId }, data: { logoUrl: null } });
  return NextResponse.json({ ok: true });
}
