import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

// Permanently removes a venue and everything under it (accounts, tables,
// bookings, emails — every relation cascades). Meant for test venues: it
// refuses anything that still has a live paid subscription, so a real
// customer can't be wiped by a mis-click, and demands the slug typed back.
const schema = z.object({ restaurantId: z.string().min(1), confirmSlug: z.string().min(1) });

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.data.restaurantId },
    include: { subscription: true, _count: { select: { reservations: true, accounts: true } } },
  });
  if (!restaurant) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  if (restaurant.slug !== parsed.data.confirmSlug.trim()) {
    return NextResponse.json({ error: `Type the venue's slug exactly (${restaurant.slug}) to confirm.` }, { status: 400 });
  }
  const sub = restaurant.subscription;
  const livePaid = !!sub?.stripeSubscriptionId && (sub.status === "ACTIVE" || sub.status === "PAST_DUE");
  if (livePaid || sub?.isComplimentary) {
    return NextResponse.json(
      { error: `${restaurant.name} has a ${sub?.isComplimentary ? "complimentary" : "live paid"} subscription — cancel it first. Deleting is for test venues.` },
      { status: 409 }
    );
  }
  await prisma.restaurant.delete({ where: { id: restaurant.id } });
  console.warn(`[platform] deleted venue ${restaurant.slug} (${restaurant.id}) with ${restaurant._count.reservations} bookings and ${restaurant._count.accounts} accounts`);
  return NextResponse.json({ ok: true, deleted: { slug: restaurant.slug, bookings: restaurant._count.reservations, accounts: restaurant._count.accounts } });
}
