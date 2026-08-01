// One-off migration: lock in The Colonial's current live floor-plan layout
// (positions manually dragged into place on Main Terrace, Bar, and Back
// Terrace) as the new defaultX/defaultY/defaultRotation for every table, so
// the "Reset floor plan" button — and anything else that ever restores from
// those columns — treats today's arrangement as the baseline instead of
// reverting to an older seeded layout. Run once during a production build,
// then removed; see prisma/README or the commit that introduced this file.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst({ where: { slug: "the-colonial" } });
  if (!restaurant) {
    console.log("The Colonial not found — skipping floor-default lock-in (fresh DB, nothing to do).");
    return;
  }
  const count = await prisma.$executeRaw`
    UPDATE "DiningTable"
    SET "defaultX" = "x", "defaultY" = "y", "defaultRotation" = "rotation"
    WHERE "restaurantId" = ${restaurant.id}
  `;
  console.log(`Locked in current floor-plan position as the default for ${count} table(s) at The Colonial.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
