// One-off production data fix (2026-07-24): the Professional plan's price
// was only ever set once via seed.ts's original $100/mo value — since the
// build no longer re-runs the full seed (to avoid wiping real bookings),
// changing `monthlyPriceCents` in seed.ts alone doesn't touch the live row.
// This applies just that one field. Run once via the build, then delete —
// same pattern as prisma/reset-colonial-live-data.ts earlier this session.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.plan.update({
    where: { key: "professional" },
    data: { monthlyPriceCents: 3000 },
  });
  console.log(`[update-plan-price] ${plan.name} monthlyPriceCents -> ${plan.monthlyPriceCents}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
