// One-time production data fix: mark every existing restaurant as already
// onboarded, so the new onboardingCompletedAt gate (src/app/host/page.tsx)
// doesn't lock out staff who signed up before this column existed.
// Wired into `build` temporarily, then removed — see git history for the
// same pattern used by earlier one-off floor-plan fixes.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.restaurant.updateMany({
    where: { onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
  console.log(`[backfill-onboarding] marked ${result.count} restaurant(s) as onboarded`);
}

main()
  .catch((err) => {
    console.error("[backfill-onboarding] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
