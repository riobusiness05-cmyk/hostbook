import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// User feedback: on the real venue, tables 13/15/16 sit further left/back
// than the floor plan currently shows, and the Main Terrace should read a
// bit wider overall. Shifting these three left (keeping their y as-is) does
// both at once, since the section's zone box is auto-computed from its
// tables' actual bounds.
async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) throw new Error("the-colonial restaurant not found");

  const targets = [13, 15, 16];
  for (const n of targets) {
    const table = await prisma.diningTable.findFirst({
      where: { restaurantId: restaurant.id, tableNumber: n },
    });
    if (!table) {
      console.log(`Table ${n} not found, skipping`);
      continue;
    }
    await prisma.diningTable.update({ where: { id: table.id }, data: { x: 10 } });
    console.log(`Table ${n}: x ${table.x} -> 10 (y unchanged: ${table.y})`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
