// One-off production data fix (2026-07-24): the schema default for
// lateThresholdMinutes changed 10 -> 15, but schema defaults only apply to
// newly-inserted rows, not ones that already exist (The Colonial/The
// Harbour's RestaurantSettings rows were already seeded at 10). Only
// touches rows still sitting at the old default — anyone who's since
// customised it via the settings page keeps their own value.
// Run once via the build, then delete — same pattern as the other one-off
// scripts this session.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.restaurantSettings.updateMany({
    where: { lateThresholdMinutes: 10 },
    data: { lateThresholdMinutes: 15 },
  });
  console.log(`[update-late-threshold] updated ${result.count} row(s) from 10 -> 15`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
