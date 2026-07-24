import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminGuard";

const patchSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  category: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }
  const faq = await prisma.faqEntry.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ faq });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.faqEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
