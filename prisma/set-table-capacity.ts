// One-off production data fix (2026-07-25): corrects real table capacities
// for The Colonial per the actual venue — individual 2-top/4-top tables in
// Main Terrace/Bar, plus three whole sections (Restaurant, Back Terrace,
// Lounge) where every table is a fixed size. Verified on local SQLite first
// (counts matched exactly: 9 Restaurant, 12 Back Terrace, 21 Lounge). Run
// once via the build, then delete.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) throw new Error('Restaurant "the-colonial" not found — refusing to run.');

  const individual: Record<number, number> = {
    17: 2,
    140: 2,
    18: 2,
    20: 2,
    21: 2,
    13: 4,
    10: 2,
    12: 2,
    14: 2,
  };
  for (const [tableNumber, size] of Object.entries(individual)) {
    const r = await prisma.diningTable.updateMany({
      where: { restaurantId: restaurant.id, tableNumber: Number(tableNumber) },
      data: { capacityMin: size, capacityMax: size },
    });
    console.log(`[set-table-capacity] table ${tableNumber} -> ${size} (${r.count} updated)`);
  }

  const sections: Record<string, number> = {
    Restaurant: 4,
    "Back Terrace": 2,
    Lounge: 2,
  };
  for (const [sectionName, size] of Object.entries(sections)) {
    const section = await prisma.section.findFirst({ where: { restaurantId: restaurant.id, name: sectionName } });
    if (!section) {
      console.log(`[set-table-capacity] section ${sectionName} not found, skipping`);
      continue;
    }
    const r = await prisma.diningTable.updateMany({
      where: { restaurantId: restaurant.id, sectionId: section.id },
      data: { capacityMin: size, capacityMax: size },
    });
    console.log(`[set-table-capacity] section ${sectionName} -> ${size} (${r.count} updated)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
