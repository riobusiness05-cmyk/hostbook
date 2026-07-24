import { NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/hostAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HOST_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
