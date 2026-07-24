import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminGuard";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.blackoutDate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
