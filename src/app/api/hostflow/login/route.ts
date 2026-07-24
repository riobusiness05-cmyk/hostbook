import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  createHostSessionToken,
  HOST_COOKIE_NAME,
  HOST_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/hostAuth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password" }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof authenticate>>;
  try {
    session = await authenticate(parsed.data.email, parsed.data.password);
  } catch {
    return NextResponse.json({ error: "Sign-in is not configured yet." }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  const token = createHostSessionToken(session.restaurantId, session.accountId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HOST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: HOST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
