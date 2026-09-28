import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTrackedLinkToken } from "@/lib/trackedLinks";
import { buildReviewUrl } from "@/lib/brandKit";

// The review button in a thank-you email lands here first: record the
// click on that email's log row, then send the guest on to the venue's
// Google review page. A bad or stale link still goes somewhere useful.
export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { PENDING: -1, SENT: 0, DELAYED: 1, DELIVERED: 2, OPENED: 3, BOUNCED: 4, COMPLAINED: 4 };

export async function GET(req: NextRequest, { params }: { params: { ref: string; token: string } }) {
  const ref = decodeURIComponent(params.ref);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  if (!verifyTrackedLinkToken(ref, params.token)) return NextResponse.redirect(`${appUrl}/hostflow`, 302);

  const [kind, id] = ref.split(":");
  const row =
    kind === "l"
      ? await prisma.emailLog.findUnique({ where: { id } })
      : kind === "v"
        ? await prisma.emailLog.findFirst({ where: { tableSessionId: id, kind: "THANK_YOU" }, orderBy: { createdAt: "desc" } })
        : null;
  if (!row) return NextResponse.redirect(`${appUrl}/hostflow`, 302);

  // First click only; a click also proves the email was opened.
  const now = new Date();
  await prisma.emailLog.update({
    where: { id: row.id },
    data: {
      ...(row.clickedAt ? {} : { clickedAt: now }),
      ...(row.openedAt ? {} : { openedAt: now }),
      ...((RANK[row.status] ?? 0) < RANK.OPENED ? { status: "OPENED" } : {}),
    },
  });

  const [restaurant, settings] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: row.restaurantId ?? "" }, select: { slug: true } }),
    prisma.restaurantSettings.findUnique({ where: { restaurantId: row.restaurantId ?? "" }, select: { googlePlaceId: true, googleReviewUrl: true } }),
  ]);
  const target = buildReviewUrl(settings?.googlePlaceId, settings?.googleReviewUrl) ?? (restaurant ? `${appUrl}/widget/${restaurant.slug}` : `${appUrl}/hostflow`);
  return NextResponse.redirect(target, 302);
}
