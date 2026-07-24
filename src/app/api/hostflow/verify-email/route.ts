import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailSchema } from "@/lib/billing/schemas";

async function verify(token: string): Promise<{ ok: boolean; error?: string }> {
  const account = await prisma.account.findUnique({ where: { emailVerifyToken: token } });
  if (!account) return { ok: false, error: "That verification link is invalid." };
  if (account.emailVerifyExpiresAt && account.emailVerifyExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: "That verification link has expired." };
  }
  await prisma.account.update({
    where: { id: account.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiresAt: null },
  });
  return { ok: true };
}

// GET so the link in the email can be a plain click-through.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const result = await verify(token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const result = await verify(parsed.data.token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
