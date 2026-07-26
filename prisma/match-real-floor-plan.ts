import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One-off layout correction: repositions every Main Room table (Restaurant,
// Main Terrace, Back Terrace, Bar) to match the restaurant's real POS floor
// plan photo. Only x/y move — shape, size, section and every other field
// stay untouched, since those already track the real venue closely from
// earlier corrections this session.
const POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 353, y: 131 },
  2: { x: 446, y: 143 },
  3: { x: 559, y: 143 },
  4: { x: 654, y: 143 },
  5: { x: 650, y: 220 },
  6: { x: 652, y: 293 },
  7: { x: 558, y: 293 },
  8: { x: 464, y: 293 },
  9: { x: 360, y: 323 },
  10: { x: 255, y: 184 },
  11: { x: 169, y: 90 },
  12: { x: 146, y: 173 },
  13: { x: 86, y: 64 },
  14: { x: 113, y: 255 },
  15: { x: 124, y: 524 },
  16: { x: 143, y: 624 },
  17: { x: 143, y: 946 },
  18: { x: 229, y: 946 },
  19: { x: 146, y: 724 },
  20: { x: 218, y: 428 },
  21: { x: 203, y: 330 },
  22: { x: 910, y: 555 },
  23: { x: 1005, y: 555 },
  24: { x: 859, y: 413 },
  25: { x: 953, y: 413 },
  26: { x: 854, y: 296 },
  27: { x: 960, y: 296 },
  28: { x: 863, y: 139 },
  29: { x: 1053, y: 171 },
  101: { x: 412, y: 457 },
  102: { x: 412, y: 491 },
  103: { x: 442, y: 529 },
  104: { x: 476, y: 581 },
  105: { x: 510, y: 581 },
  106: { x: 547, y: 581 },
  107: { x: 585, y: 581 },
  108: { x: 622, y: 581 },
  109: { x: 664, y: 581 },
  110: { x: 334, y: 649 },
  111: { x: 371, y: 649 },
  112: { x: 412, y: 649 },
  113: { x: 476, y: 649 },
  114: { x: 510, y: 649 },
  120: { x: 317, y: 452 },
  125: { x: 577, y: 625 },
  130: { x: 620, y: 629 },
  135: { x: 718, y: 617 },
  140: { x: 728, y: 518 },
  170: { x: 135, y: 824 },
  200: { x: 1085, y: 673 },
  300: { x: 1085, y: 452 },
  400: { x: 1085, y: 325 },
  500: { x: 1108, y: 145 },
};

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "the-colonial" } });
  if (!restaurant) throw new Error("the-colonial restaurant not found");

  let updated = 0;
  for (const [numStr, pos] of Object.entries(POSITIONS)) {
    const tableNumber = Number(numStr);
    const result = await prisma.diningTable.updateMany({
      where: { restaurantId: restaurant.id, tableNumber },
      data: { x: pos.x, y: pos.y },
    });
    if (result.count > 0) updated += result.count;
    else console.log(`No table ${tableNumber} found — skipped`);
  }

  console.log(`Done. Repositioned ${updated} tables.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
