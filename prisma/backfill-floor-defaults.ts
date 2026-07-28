// One-time production data fix: populate defaultX/defaultY/defaultRotation
// on existing DiningTable rows for The Colonial and The Harbour, using the
// exact same canonical layout data seed.ts uses — NOT each table's current
// (possibly drag-drifted) position — so "Reset floor plan" restores the
// real intended venue layout, not whatever it happens to be right now.
// Wired into `build` temporarily, then removed — same pattern as other
// one-off production fixes (see prisma/backfill-onboarding.ts history).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedTable = {
  n: number;
  seats: number;
  shape: "ROUND" | "RECT" | "SQUARE";
  cx: number;
  cy: number;
  w?: number;
  h?: number;
};

function dims(t: SeedTable): [number, number] {
  if (t.w && t.h) return [t.w, t.h];
  if (t.shape === "ROUND") return t.seats >= 6 ? [112, 112] : t.seats >= 3 ? [86, 86] : [46, 46];
  if (t.shape === "RECT") return t.seats >= 5 ? [150, 88] : [52, 86];
  return t.seats >= 6 ? [112, 112] : [90, 90]; // SQUARE
}

// Kept in sync with the FLOOR array in seed.ts.
const FLOOR: SeedTable[] = [
  { n: 13, seats: 4, shape: "SQUARE", cx: 95, cy: 150 },
  { n: 11, seats: 4, shape: "SQUARE", cx: 240, cy: 185 },
  { n: 12, seats: 4, shape: "SQUARE", cx: 150, cy: 300 },
  { n: 10, seats: 4, shape: "SQUARE", cx: 290, cy: 320 },
  { n: 14, seats: 4, shape: "SQUARE", cx: 95, cy: 420 },
  { n: 21, seats: 4, shape: "SQUARE", cx: 250, cy: 470 },
  { n: 15, seats: 4, shape: "SQUARE", cx: 110, cy: 540 },
  { n: 20, seats: 4, shape: "SQUARE", cx: 250, cy: 600 },
  { n: 16, seats: 4, shape: "SQUARE", cx: 110, cy: 660 },
  { n: 19, seats: 4, shape: "SQUARE", cx: 255, cy: 720 },
  { n: 170, seats: 6, shape: "ROUND", cx: 140, cy: 835 },
  { n: 17, seats: 4, shape: "SQUARE", cx: 110, cy: 945 },
  { n: 18, seats: 4, shape: "SQUARE", cx: 255, cy: 945 },
  { n: 1, seats: 4, shape: "SQUARE", cx: 490, cy: 195 },
  { n: 2, seats: 4, shape: "SQUARE", cx: 620, cy: 200 },
  { n: 3, seats: 4, shape: "SQUARE", cx: 745, cy: 200 },
  { n: 4, seats: 4, shape: "SQUARE", cx: 865, cy: 205 },
  { n: 5, seats: 6, shape: "RECT", cx: 900, cy: 345 },
  { n: 9, seats: 4, shape: "SQUARE", cx: 500, cy: 480 },
  { n: 8, seats: 6, shape: "RECT", cx: 640, cy: 470, w: 92, h: 150 },
  { n: 7, seats: 6, shape: "RECT", cx: 770, cy: 475, w: 92, h: 150 },
  { n: 6, seats: 6, shape: "RECT", cx: 880, cy: 470, w: 92, h: 150 },
  { n: 120, seats: 4, shape: "ROUND", cx: 490, cy: 725 },
  { n: 101, seats: 2, shape: "ROUND", cx: 580, cy: 700, w: 38, h: 38 },
  { n: 102, seats: 2, shape: "ROUND", cx: 580, cy: 752, w: 38, h: 38 },
  { n: 103, seats: 2, shape: "ROUND", cx: 622, cy: 800, w: 38, h: 38 },
  { n: 104, seats: 2, shape: "ROUND", cx: 660, cy: 865, w: 38, h: 38 },
  { n: 105, seats: 2, shape: "ROUND", cx: 712, cy: 865, w: 38, h: 38 },
  { n: 106, seats: 2, shape: "ROUND", cx: 764, cy: 865, w: 38, h: 38 },
  { n: 107, seats: 2, shape: "ROUND", cx: 816, cy: 865, w: 38, h: 38 },
  { n: 108, seats: 2, shape: "ROUND", cx: 868, cy: 865, w: 38, h: 38 },
  { n: 109, seats: 2, shape: "ROUND", cx: 920, cy: 865, w: 38, h: 38 },
  { n: 110, seats: 2, shape: "ROUND", cx: 560, cy: 945, w: 38, h: 38 },
  { n: 111, seats: 2, shape: "ROUND", cx: 612, cy: 945, w: 38, h: 38 },
  { n: 112, seats: 2, shape: "ROUND", cx: 664, cy: 945, w: 38, h: 38 },
  { n: 113, seats: 2, shape: "ROUND", cx: 730, cy: 945, w: 38, h: 38 },
  { n: 114, seats: 2, shape: "ROUND", cx: 782, cy: 945, w: 38, h: 38 },
  { n: 125, seats: 2, shape: "SQUARE", cx: 860, cy: 940, w: 62, h: 70 },
  { n: 130, seats: 2, shape: "RECT", cx: 935, cy: 940, w: 72, h: 62 },
  { n: 28, seats: 6, shape: "SQUARE", cx: 1140, cy: 200 },
  { n: 29, seats: 2, shape: "RECT", cx: 1270, cy: 210 },
  { n: 500, seats: 4, shape: "ROUND", cx: 1375, cy: 200 },
  { n: 26, seats: 4, shape: "SQUARE", cx: 1140, cy: 360 },
  { n: 27, seats: 4, shape: "SQUARE", cx: 1255, cy: 375 },
  { n: 400, seats: 4, shape: "ROUND", cx: 1385, cy: 380 },
  { n: 24, seats: 4, shape: "SQUARE", cx: 1130, cy: 520 },
  { n: 25, seats: 4, shape: "SQUARE", cx: 1245, cy: 530 },
  { n: 300, seats: 4, shape: "ROUND", cx: 1375, cy: 560 },
  { n: 140, seats: 6, shape: "ROUND", cx: 1110, cy: 690 },
  { n: 22, seats: 4, shape: "SQUARE", cx: 1240, cy: 700 },
  { n: 23, seats: 4, shape: "SQUARE", cx: 1345, cy: 710 },
  { n: 135, seats: 4, shape: "ROUND", cx: 1120, cy: 835 },
  { n: 200, seats: 4, shape: "ROUND", cx: 1360, cy: 850 },
  { n: 33, seats: 2, shape: "RECT", cx: 390, cy: 160, w: 52, h: 104 },
  { n: 32, seats: 2, shape: "RECT", cx: 845, cy: 165, w: 52, h: 104 },
  { n: 36, seats: 4, shape: "SQUARE", cx: 370, cy: 365 },
  { n: 360, seats: 2, shape: "RECT", cx: 548, cy: 380, w: 52, h: 104 },
  { n: 35, seats: 4, shape: "SQUARE", cx: 555, cy: 690 },
  { n: 350, seats: 2, shape: "RECT", cx: 722, cy: 670, w: 52, h: 104 },
  { n: 37, seats: 4, shape: "SQUARE", cx: 415, cy: 920 },
  { n: 370, seats: 2, shape: "RECT", cx: 562, cy: 915, w: 52, h: 104 },
  { n: 31, seats: 4, shape: "ROUND", cx: 838, cy: 1000 },
  { n: 30, seats: 4, shape: "SQUARE", cx: 625, cy: 1055 },
  { n: 40, seats: 4, shape: "ROUND", cx: 1000, cy: 205 },
  { n: 41, seats: 4, shape: "ROUND", cx: 1200, cy: 185 },
  { n: 42, seats: 4, shape: "ROUND", cx: 1358, cy: 190 },
  { n: 43, seats: 4, shape: "ROUND", cx: 1472, cy: 190 },
  { n: 44, seats: 4, shape: "ROUND", cx: 1598, cy: 190 },
  { n: 46, seats: 4, shape: "ROUND", cx: 1428, cy: 365 },
  { n: 45, seats: 4, shape: "ROUND", cx: 1658, cy: 365 },
  { n: 49, seats: 4, shape: "ROUND", cx: 1508, cy: 592 },
  { n: 50, seats: 4, shape: "ROUND", cx: 1692, cy: 602 },
  { n: 47, seats: 4, shape: "ROUND", cx: 1492, cy: 820 },
  { n: 48, seats: 4, shape: "ROUND", cx: 1692, cy: 815 },
];

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: ["the-colonial", "the-harbour"] } },
    select: { id: true, slug: true },
  });

  let updated = 0;
  for (const restaurant of restaurants) {
    const tables = await prisma.diningTable.findMany({
      where: { restaurantId: restaurant.id, defaultX: null },
      select: { id: true, tableNumber: true },
    });
    for (const table of tables) {
      const seedRow = FLOOR.find((f) => f.n === table.tableNumber);
      if (!seedRow) continue;
      const [w, h] = dims(seedRow);
      await prisma.diningTable.update({
        where: { id: table.id },
        data: { defaultX: seedRow.cx - w / 2, defaultY: seedRow.cy - h / 2, defaultRotation: 0 },
      });
      updated++;
    }
  }
  console.log(`[backfill-floor-defaults] set defaults on ${updated} table(s) across ${restaurants.length} restaurant(s)`);
}

main()
  .catch((err) => {
    console.error("[backfill-floor-defaults] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
