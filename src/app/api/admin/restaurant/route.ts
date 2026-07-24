import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { isAdminRequest } from "@/lib/adminGuard";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  tagline: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  welcomeMessage: z.string().min(1).optional(),
  maxPartySize: z.number().int().min(1).max(50).optional(),
  defaultReservationMinutes: z.number().int().min(15).max(360).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getActiveRestaurant();
  return NextResponse.json({ restaurant });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  }

  const restaurant = await getActiveRestaurant();
  const updated = await prisma.restaurant.update({ where: { id: restaurant.id }, data: parsed.data });
  return NextResponse.json({ restaurant: updated });
}
