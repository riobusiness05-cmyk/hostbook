import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminGuard";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  capacityMin: z.number().int().min(1).optional(),
  capacityMax: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }
  const table = await prisma.diningTable.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ table });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.diningTable.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
