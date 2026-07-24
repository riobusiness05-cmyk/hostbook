import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export function isAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}
