import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { isAdminRequest } from "@/lib/adminGuard";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getActiveRestaurant();
  const tables = await prisma.diningTable.findMany({ where: { restaurantId: restaurant.id }, orderBy: { name: "asc" } });
  return NextResponse.json({ tables });
}

const createSchema = z.object({
  name: z.string().min(1),
  capacityMin: z.number().int().min(1).default(1),
  capacityMax: z.number().int().min(1),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid table", details: parsed.error.flatten() }, { status: 400 });
  }
  const restaurant = await getActiveRestaurant();
  const table = await prisma.diningTable.create({ data: { restaurantId: restaurant.id, ...parsed.data } });
  return NextResponse.json({ table }, { status: 201 });
}
