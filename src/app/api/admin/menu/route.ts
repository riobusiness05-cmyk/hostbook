import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { isAdminRequest } from "@/lib/adminGuard";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getActiveRestaurant();
  const items = await prisma.menuItem.findMany({ where: { restaurantId: restaurant.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ items });
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().optional(),
  category: z.string().default("Menu"),
  allergens: z.string().optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid menu item", details: parsed.error.flatten() }, { status: 400 });
  }
  const restaurant = await getActiveRestaurant();
  const item = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, ...parsed.data } });
  return NextResponse.json({ item }, { status: 201 });
}
