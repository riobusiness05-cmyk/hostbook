// One-off maintenance script (2026-07-24): clears the demo dinner-service
// snapshot that `seed.ts` generates for The Colonial, so the live dashboard
// starts empty and ready for real bookings/walk-ins as staff enter them.
//
// Deliberately scoped to the "the-colonial" restaurant only — never touches
// The Harbour (still a demo restaurant) or any future tenant. Leaves the
// real floor plan (Section/DiningTable geometry), staff roster, menu,
// opening hours, FAQs, account login, and billing/subscription state
// untouched — only clears transactional "live state": reservations,
// walk-ins, table sessions, notifications, and the table status audit
// trail, then resets every table to AVAILABLE/unassigned/unmerged.
//
// Meant to be run once (wired temporarily into the Vercel build command so
// it executes with real production credentials) and then deleted — do not
// leave this wired into `build` permanently, or a future deploy could wipe
// real guest data.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) {
    throw new Error('Restaurant with slug "the-colonial" not found — refusing to run.');
  }
  const restaurantId = restaurant.id;

  const [sessions, reservations, walkins, notifications, history] = await Promise.all([
    prisma.tableSession.deleteMany({ where: { restaurantId } }),
    prisma.reservation.deleteMany({ where: { restaurantId } }),
    prisma.walkin.deleteMany({ where: { restaurantId } }),
    prisma.notification.deleteMany({ where: { restaurantId } }),
    prisma.tableStatusHistory.deleteMany({ where: { restaurantId } }),
  ]);

  const tables = await prisma.diningTable.updateMany({
    where: { restaurantId },
    data: { status: "AVAILABLE", notes: null, mergedIntoId: null, serverId: null },
  });

  console.log(
    `[reset-colonial-live-data] restaurant=${restaurant.name} (${restaurantId}) — ` +
      `deleted sessions=${sessions.count} reservations=${reservations.count} walkins=${walkins.count} ` +
      `notifications=${notifications.count} statusHistory=${history.count}; reset tables=${tables.count} to AVAILABLE`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
