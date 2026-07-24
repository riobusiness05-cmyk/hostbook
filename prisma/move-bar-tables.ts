// One-off production data fix (2026-07-25): tables 135 and 140 were seeded
// into the "Back Terrace" section but physically belong in the Bar — moves
// them to that section and repositions them into open space in the Bar's
// existing layout (verified visually on local SQLite first: no overlap with
// the existing 101-114/120/125/130 cluster, and Back Terrace still renders
// cleanly without them). Run once via the build, then delete.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) throw new Error('Restaurant "the-colonial" not found — refusing to run.');

  const bar = await prisma.section.findFirst({ where: { restaurantId: restaurant.id, name: "Bar" } });
  if (!bar) throw new Error("Bar section not found — refusing to run.");

  const moves = [
    { tableNumber: 140, x: 960, y: 660 },
    { tableNumber: 135, x: 960, y: 800 },
  ];

  for (const m of moves) {
    const table = await prisma.diningTable.findFirst({
      where: { restaurantId: restaurant.id, tableNumber: m.tableNumber },
    });
    if (!table) {
      console.log(`[move-bar-tables] table ${m.tableNumber} not found, skipping`);
      continue;
    }
    await prisma.diningTable.update({
      where: { id: table.id },
      data: { sectionId: bar.id, x: m.x, y: m.y },
    });
    console.log(`[move-bar-tables] table ${m.tableNumber} -> Bar (${m.x}, ${m.y})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
