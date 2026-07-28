// One-time production data fix, wired into `build` temporarily then removed
// (same pattern as prior one-off fixes):
//   1. capacityMin -> 1 on every table, everywhere — any table can now be
//      booked from 1 guest up to its seat count, no per-table minimum.
//   2. The Colonial / The Harbour only: remove the 101-109 bar-stool tables
//      and move 140 + 135 in from the (outdoor) Back Terrace to fill that
//      freed-up space inside the Bar.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REMOVE_NUMBERS = [101, 102, 103, 104, 105, 106, 107, 108, 109];
// New positions inside the Bar zone (where the removed stools were).
const MOVE_INSIDE: Record<number, { cx: number; cy: number }> = {
  140: { cx: 650, cy: 780 }, // 112x112 round
  135: { cx: 850, cy: 790 }, // 86x86 round
};

async function main() {
  const capacityFix = await prisma.diningTable.updateMany({
    where: { capacityMin: { not: 1 } },
    data: { capacityMin: 1 },
  });
  console.log(`[fix-tables] capacityMin -> 1 on ${capacityFix.count} table(s)`);

  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: ["the-colonial", "the-harbour"] } },
    select: { id: true, slug: true },
  });

  for (const restaurant of restaurants) {
    const bar = await prisma.section.findUnique({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: "Bar" } },
    });
    if (!bar) {
      console.log(`[fix-tables] ${restaurant.slug}: no Bar section, skipping`);
      continue;
    }

    // ── Remove 101-109, unless one is genuinely in use right now ──
    const toRemove = await prisma.diningTable.findMany({
      where: { restaurantId: restaurant.id, tableNumber: { in: REMOVE_NUMBERS } },
      include: {
        tableSessions: { where: { status: "SEATED" } },
        reservations: { where: { status: { in: ["PENDING", "CONFIRMED"] } } },
      },
    });
    for (const t of toRemove) {
      if (t.tableSessions.length > 0 || t.reservations.length > 0) {
        console.log(`[fix-tables] ${restaurant.slug}: skipping Table ${t.tableNumber} — currently seated or has an upcoming booking`);
        continue;
      }
      await prisma.diningTable.delete({ where: { id: t.id } });
      console.log(`[fix-tables] ${restaurant.slug}: removed Table ${t.tableNumber}`);
    }

    // ── Move 140 and 135 into the Bar ──
    for (const [numStr, pos] of Object.entries(MOVE_INSIDE)) {
      const num = Number(numStr);
      const table = await prisma.diningTable.findUnique({
        where: { restaurantId_tableNumber: { restaurantId: restaurant.id, tableNumber: num } },
      });
      if (!table) continue;
      const x = pos.cx - table.width / 2;
      const y = pos.cy - table.height / 2;
      await prisma.diningTable.update({
        where: { id: table.id },
        data: { sectionId: bar.id, x, y, rotation: 0, defaultX: x, defaultY: y, defaultRotation: 0 },
      });
      console.log(`[fix-tables] ${restaurant.slug}: moved Table ${num} into the Bar`);
    }
  }
}

main()
  .catch((err) => {
    console.error("[fix-tables] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
