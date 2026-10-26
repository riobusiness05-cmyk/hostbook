import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

// Support lookup: a venue's upcoming bookings with whatever contact details
// and origin we have — for "who is this party and how do we reach them".
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();
  const minParty = Number(url.searchParams.get("minParty") ?? "0");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  const rows = await prisma.reservation.findMany({
    where: {
      restaurantId,
      reservationTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      ...(q ? { customerName: { contains: q } } : {}),
      ...(minParty > 0 ? { partySize: { gte: minParty } } : {}),
    },
    orderBy: { reservationTime: "asc" },
    take: 50,
    include: { table: { select: { tableNumber: true } } },
  });
  return NextResponse.json({
    reservations: rows.map((r) => ({
      id: r.id,
      name: r.customerName,
      partySize: r.partySize,
      at: r.reservationTime,
      status: r.status,
      source: r.source,
      email: r.customerEmail,
      phone: r.customerPhone,
      notes: r.notes,
      occasion: r.occasion,
      seatingPreference: r.seatingPreference,
      table: r.table?.tableNumber ?? null,
      cardOnFile: !!r.stripePaymentMethodId,
      createdAt: r.createdAt,
      language: r.language,
    })),
  });
}
