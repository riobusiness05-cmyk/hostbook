import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One-off cleanup: clears accumulated test/demo operational state so the
// floor plan starts clean. Confirmed beforehand that no real sessions,
// reservations, or walk-ins exist to lose — this only touches BLOCKED
// status, leftover test merges, and stray notifications. Never touches
// table geometry (x/y/rotation/shape/section) or capacity baselines.
async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) throw new Error("the-colonial restaurant not found");

  // Split any live merges the same way the app's own splitTable does: reduce
  // the primary's capacityMax by exactly what each child contributed, never
  // by resetting to capacityMin — plenty of tables (e.g. the Bar's 1-2 seat
  // ones) have a legitimately wider max than their min with no merge involved.
  const merged = await prisma.diningTable.findMany({
    where: { restaurantId: restaurant.id, mergedIntoId: { not: null } },
  });
  const byPrimary = new Map<string, typeof merged>();
  for (const child of merged) {
    const list = byPrimary.get(child.mergedIntoId!) ?? [];
    list.push(child);
    byPrimary.set(child.mergedIntoId!, list);
  }
  for (const [primaryId, children] of byPrimary) {
    const primary = await prisma.diningTable.findUnique({ where: { id: primaryId } });
    if (!primary) continue;
    const restoredCapacity = children.reduce((n, c) => n + c.capacityMax, 0);
    const newMax = Math.max(primary.capacityMin, primary.capacityMax - restoredCapacity);
    await prisma.diningTable.update({ where: { id: primaryId }, data: { capacityMax: newMax } });
    console.log(`Restored T${primary.tableNumber} capacityMax ${primary.capacityMax} -> ${newMax}`);
    for (const child of children) {
      await prisma.diningTable.update({ where: { id: child.id }, data: { mergedIntoId: null } });
      console.log(`Split T${child.tableNumber} from T${primary.tableNumber}`);
    }
  }

  const blocked = await prisma.diningTable.updateMany({
    where: { restaurantId: restaurant.id, status: { not: "AVAILABLE" } },
    data: { status: "AVAILABLE" },
  });
  console.log(`Set ${blocked.count} tables back to AVAILABLE`);

  const notifications = await prisma.notification.deleteMany({ where: { restaurantId: restaurant.id } });
  console.log(`Cleared ${notifications.count} notifications`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
