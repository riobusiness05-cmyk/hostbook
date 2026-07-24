import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { isAdminRequest } from "@/lib/adminGuard";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getActiveRestaurant();
  const faqs = await prisma.faqEntry.findMany({ where: { restaurantId: restaurant.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ faqs });
}

const createSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().default("General"),
  sortOrder: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid FAQ", details: parsed.error.flatten() }, { status: 400 });
  }
  const restaurant = await getActiveRestaurant();
  const faq = await prisma.faqEntry.create({ data: { restaurantId: restaurant.id, ...parsed.data } });
  return NextResponse.json({ faq }, { status: 201 });
}
