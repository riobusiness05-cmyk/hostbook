import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_COOKIE_NAME,
  checkAdminCredentials,
  createSessionToken,
} from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  let valid: boolean;
  try {
    valid = checkAdminCredentials(parsed.data.email, parsed.data.password);
  } catch {
    return NextResponse.json(
      { error: "Admin login isn't configured yet — set ADMIN_EMAIL/ADMIN_PASSWORD in .env" },
      { status: 500 }
    );
  }

  if (!valid) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const token = createSessionToken(parsed.data.email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
