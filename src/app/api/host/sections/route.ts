import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";

// The venue's areas as guests see them: name, description line, whether
// online bookings may choose/land there. Edited from Settings → Tables.
export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const sections = await prisma.section.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { tables: true } } },
  });
  return NextResponse.json({
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      note: s.note,
      bookableOnline: s.bookableOnline,
      isOutdoor: s.isOutdoor,
      tableCount: s._count.tables,
    })),
  });
}
