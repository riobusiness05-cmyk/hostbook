import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One-off repair for leftover data corruption caused by a bug in mergeTables:
// it never checked whether the "primary" table was itself already a merged
// child, so merging into an already-merged table silently built a chain
// (or, when the two merges pointed at each other, an outright cycle) instead
// of one flat combined group. Fixed in code (see actions.ts); this untangles
// the data that bug already produced. Only clears the stale mergedIntoId
// link and, where it drifted from the table's own capacityMin (which merges
// never touch, so it's still the correct base value), resets capacityMax
// back to it. Never touches status, sessions, or reservations.
async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) throw new Error("the-colonial restaurant not found");

  const tables = await prisma.diningTable.findMany({ where: { restaurantId: restaurant.id } });
  const linked = tables.filter((t) => t.mergedIntoId !== null);

  for (const t of linked) {
    await prisma.diningTable.update({ where: { id: t.id }, data: { mergedIntoId: null } });
    console.log(`Cleared mergedIntoId on T${t.tableNumber}`);
  }

  const mismatched = tables.filter((t) => t.capacityMax !== t.capacityMin && t.mergedIntoId !== null);
  for (const t of mismatched) {
    await prisma.diningTable.update({ where: { id: t.id }, data: { capacityMax: t.capacityMin } });
    console.log(`Reset T${t.tableNumber} capacityMax ${t.capacityMax} -> ${t.capacityMin}`);
  }

  console.log(`Done. Cleared ${linked.length} stale merge links, fixed ${mismatched.length} capacities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
