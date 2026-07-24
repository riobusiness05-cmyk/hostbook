import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";

// Every table, active or not — for the Settings → Tables availability
// toggle. `getFloorState`/`/api/host/floor` deliberately excludes inactive
// tables (they're off the live floor), so this is a separate, minimal read.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const tables = await prisma.diningTable.findMany({
    where: { restaurantId: ctx.restaurantId },
    include: { section: true },
    orderBy: { tableNumber: "asc" },
  });

  return NextResponse.json({
    tables: tables.map((t) => ({
      id: t.id,
      tableNumber: t.tableNumber,
      name: t.name,
      capacityMin: t.capacityMin,
      capacityMax: t.capacityMax,
      isActive: t.isActive,
      sectionName: t.section?.name ?? null,
    })),
  });
}
