import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

// Records an unsubscribe. Reached two ways: the form on /email/unsubscribe
// (redirects back with ?done=1) and mail clients' one-click unsubscribe
// (List-Unsubscribe-Post), which POSTs here directly. Never on GET — link
// scanners prefetch links, and that must not unsubscribe anyone.
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("r") ?? "";
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const token = url.searchParams.get("t") ?? "";
  if (!restaurantId || !email || !token || !verifyUnsubscribeToken(restaurantId, email, token)) {
    return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 });
  }
  await prisma.emailSuppression.upsert({
    where: { restaurantId_email: { restaurantId, email } },
    create: { restaurantId, email },
    update: {},
  });
  const wantsPage = (req.headers.get("accept") ?? "").includes("text/html");
  if (wantsPage) {
    const back = new URL("/email/unsubscribe", url.origin);
    back.search = url.search;
    back.searchParams.set("done", "1");
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.json({ ok: true });
}
