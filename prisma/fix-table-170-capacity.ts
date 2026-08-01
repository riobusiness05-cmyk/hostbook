// One-off migration: Table 170 at The Colonial was seeded/imported with
// capacityMax 6; it's actually a 2-top. Run once during a production build,
// then removed.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst({ where: { slug: "the-colonial" } });
  if (!restaurant) {
    console.log("The Colonial not found — skipping table-170 capacity fix (fresh DB, nothing to do).");
    return;
  }
  const result = await prisma.diningTable.updateMany({
    where: { restaurantId: restaurant.id, tableNumber: 170 },
    data: { capacityMin: 1, capacityMax: 2 },
  });
  console.log(`Updated capacity for ${result.count} table(s) matching Table 170 at The Colonial.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
