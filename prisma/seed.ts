import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { grantComplimentary, startTrial, DEFAULT_PLAN_KEY } from "../src/lib/billing/subscription";

const prisma = new PrismaClient();

const PROFESSIONAL_FEATURES = [
  "Unlimited reservations",
  "AI table allocation",
  "Booking website",
  "Live floor plans",
  "Waitlist management",
  "Staff accounts",
  "Analytics",
  "Workflows",
];

/** Upserts the Professional plan catalogue row. Called once — Plan rows are
 *  global, not per-restaurant. */
async function seedPlans() {
  await prisma.plan.upsert({
    where: { key: DEFAULT_PLAN_KEY },
    create: {
      key: DEFAULT_PLAN_KEY,
      name: "Professional",
      description: "Everything a high-volume restaurant or bar needs to run its floor.",
      monthlyPriceCents: 3000,
      sortOrder: 0,
      features: JSON.stringify(PROFESSIONAL_FEATURES),
    },
    update: {
      name: "Professional",
      description: "Everything a high-volume restaurant or bar needs to run its floor.",
      monthlyPriceCents: 3000,
      features: JSON.stringify(PROFESSIONAL_FEATURES),
    },
  });
}

/** Seeds a restaurant's Subscription row — complimentary for early partners
 *  (The Colonial), an ordinary trial (TRIAL_DAYS) for everyone else (The Harbour),
 *  via the exact same reusable functions the platform admin panel and
 *  self-serve registration flow call. Nothing here is Colonial-specific. */
async function seedBilling(restaurantId: string, opts: { complimentary: boolean; reason?: string }) {
  if (opts.complimentary) {
    await grantComplimentary(restaurantId, { reason: opts.reason, grantedBy: "seed" });
  } else {
    await startTrial(restaurantId);
  }
}

// Mirrors src/lib/hostAuth.ts hashPassword (scrypt$salt$hash). Kept inline so
// the seed script doesn't import the Next-runtime auth module.
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function upsertAccount(restaurantId: string, email: string, password: string, name: string, role: string) {
  const passwordHash = hashPassword(password);
  await prisma.account.upsert({
    where: { email },
    create: { restaurantId, email, passwordHash, name, role },
    update: { restaurantId, passwordHash, name, role },
  });
}

/**
 * Seeds The Colonial Bar · Restaurant · Bistro (Costa Adeje, Tenerife).
 * Data sourced from colonialrestauranttenerife.com.
 *
 * Safe to re-run: it upserts the restaurant and replaces its hours,
 * tables, FAQs and menu each time. It never touches reservations or chat
 * history, so don't re-run this against a database that already has real
 * client bookings in it.
 */

const SLUG = process.env.NEXT_PUBLIC_RESTAURANT_SLUG || "the-colonial";

// [name, description, price] tuples grouped by menu category.
type Item = [string, string | null, number];

const KITCHEN: Record<string, Item[]> = {
  "Breakfast · until 1pm": [
    ["The Full English", "Two eggs, bacon, sausages, fried bread, tomato, beans & mushrooms", 7.5],
    ["The Full Scottish", "Fried egg, bacon, square sausage, black pudding, tattie scone, hash brown, fried bread, tomato & beans", 7.95],
    ["The Full Veggie", "Quorn sausage, two eggs, beans, tomatoes, hash brown, mushrooms, toast or fried bread", 7.95],
    ["Scrambled Egg on Toast", "Creamy scrambled egg on white or brown toast", 4.5],
    ["Fried or Poached Egg on Toast", "Two eggs on white or brown toast", 4.5],
    ["Beans on Toast", "White or brown toast", 4.5],
    ["Bacon Sandwich", "Back bacon on white or brown bread", 4.75],
    ["Sausage Sandwich", "Premium sausages on white or brown bread", 4.75],
    ["Croissant", "With butter & jam or marmalade", 3.0],
  ],
  "Daytime · until 6pm": [
    ["Fried Eggs & Chips", "Two fried eggs cooked as you like them", 6.95],
    ["Ham, Egg & Chips", "Grilled ham steak with a perfectly fried egg", 7.5],
    ["Sausage, Chips & Beans", "Two quality pork sausages", 7.5],
    ["Fish Fingers & Chips", "Breaded cod goujons", 7.5],
    ["Colonial Sausage & Mash", "Fried onions, peas & gravy", 7.95],
    ["The Colonial Club Sandwich", "Chicken breast, bacon, omelette, lettuce, tomato, mayonnaise & chips", 12.95],
    ["Fish Finger Sandwich", null, 6.95],
    ["Prawn & Salad Sandwich", null, 7.5],
    ["Chicken Breast & Salad Sandwich", null, 7.5],
    ["Baked Potato, Prawns & Marie Rose", null, 8.5],
    ["Baked Potato, Chilli or Bolognese", null, 7.95],
    ["Baked Potato, Cheese & Beans", null, 5.5],
  ],
  Starters: [
    ["Garlic Bread", null, 3.5],
    ["Soup of the Day", "Served with a bread roll", 5.95],
    ["Colonial Crab Chowder", "Served with a warm crusty roll", 9.95],
    ["Pâté with Toast", null, 7.5],
    ["Potato Wedges", "With a chilli & mayo dip", 6.95],
    ["Nachos", "Chilli con carne, sour cream & cheese topping", 10.95],
    ["Vegetarian Nachos", "Quorn chilli, sour cream & cheese topping", 11.95],
    ["Garlic Mushrooms", "Pan fried in garlic butter, bread roll", 7.5],
    ["Fried Camembert", "With cranberry sauce", 9.95],
    ["Prawn Cocktail", "On a bed of salad with brown bread", 9.95],
    ["King Prawns", "Pan fried in garlic butter, bread roll", 13.95],
    ["Calamari", "Panko-coated squid rings, coleslaw & alioli", 11.95],
    ["Stuffed Jalapeños", "With sour cream", 10.95],
  ],
  "Omelettes & Salads": [
    ["The Colonial Omelette", "Cheese, ham, mushrooms & prawns, with chips & salad", 11.95],
    ["Omelette", "Plain 7.95 · cheese or ham 8.95 · prawns 9.95", 7.95],
    ["Caesar Salad", "Chicken breast, parmesan, bacon, croutons & Caesar dressing", 11.95],
    ["The Colonial Indian Chicken Salad", "Goan massala chicken, baby spinach, red onion & cucumber", 12.5],
    ["Prawns & Marie Rose Salad", null, 11.95],
    ["Tuna Salad", null, 9.95],
  ],
  Pizza: [
    ["Margherita", "Cheese & tomato", 7.95],
    ["Napolitano", "Cheese, tomato & ham", 8.95],
    ["Caprichosa", "Cheese, tomato, ham & mushroom", 8.95],
    ["Romano", "Cheese, tomato, bacon & onion", 8.95],
    ["Vegetarian", "Peppers, onions, mushrooms & olives", 8.95],
    ["Estella de Mar", "Tuna, prawns & peppers", 9.75],
    ["Tropicana", "Ham, mushrooms & pineapple", 9.75],
    ["Mexicana", "Garlic, onions & chilli con carne", 9.75],
    ["Pepperoni", null, 9.75],
    ["The Colonial Pizza", "BBQ sauce, bacon, onion & chicken", 11.75],
  ],
  Pasta: [
    ["Penne Pasta", "Arrabiata (v), Cajun chicken, or prawns & chorizo", 13.95],
    ["Spaghetti Bolognese", "Minced beef in a tomato ragu", 10.95],
    ["Spaghetti Carbonara", "Bacon, mushrooms, cream & white wine", 9.95],
    ["Homemade Lasagne", "Served with garlic bread", 11.5],
    ["The Colonial Seafood Spaghetti", "Calamares, prawns, mussels & clams", 14.75],
  ],
  "Colonial Pies": [
    ["Steak & Ale Pie", "Topped with puff pastry, chips & peas", 13.95],
    ["Minced Beef & Potato Pie", "Chips & peas", 13.5],
    ["Chicken, Bacon & Leek Pie", "Chips & peas", 13.5],
    ["Corned Beef & Potato Pie", "Chips & peas", 13.5],
    ["Shepherd's Pie", "Minced lamb, peas & carrots, mash topping", 12.95],
  ],
  Classics: [
    ["Golden Beer Battered Haddock", "Chips & salad", 13.95],
    ["Golden Breaded Scampi", "Chips & salad", 14.95],
    ["½ Roast Chicken", "Chips & salad", 10.95],
    ["Chicken Curry", "Rice, chips or both, with naan", 13.95],
    ["Chilli Con Carne", "Rice, chips or both", 12.95],
    ["Moules Mariner", "Mussels in white wine, garlic bread", 13.95],
    ["Chicken Fajitas", "Sour cream, guacamole & pico de gallo", 14.95],
  ],
  "From the Grill": [
    ["Prime Fillet Steak", "Cooked to your liking, chips, salad & choice of sauce", 24.95],
    ["Prime Sirloin Steak", "Cooked to your liking, chips, salad & choice of sauce", 22.95],
    ["Colonial Half Shoulder of Lamb", "Chips & vegetables", 22.95],
    ["Grilled Pork Chops", "Apple sauce, chips & salad", 15.95],
    ["Grilled Chicken Breast", "Chips & salad", 13.95],
  ],
  Burgers: [
    ["Colonial Beef Burger", "300g on toasted brioche: cheddar, fried egg, bacon, relish, pickles & chips", 14.95],
    ["Beef Burger", "200g chargrilled, chips, coleslaw & salad", 9.95],
    ["Battered Chicken Breast Burger", null, 10.5],
    ["Beef Burger topped with Chilli Con Carne", null, 11.95],
    ["Quorn Burger", "Chips, coleslaw & salad garnish", 11.95],
  ],
  Desserts: [
    ["Homemade Cheesecake", "With cream or ice cream", 6.5],
    ["Homemade Apple Pie", "Custard, ice cream or cream", 6.5],
    ["Apple Crumble", "Custard, ice cream or cream", 6.5],
    ["Hot Chocolate Fudge Cake", "Custard, ice cream or cream", 6.5],
    ["Carrot Cake", "With cream or ice cream", 6.5],
    ["Freshly Baked Scone", "Cornish clotted cream & strawberry jam", 6.5],
    ["The Colonial Cheeseboard", "Manchego, cheddar, roquefort & camembert", 7.5],
    ["Famous Homemade Crêpes", "Sugar & lemon 4.95 · Nutella 6.25 · banana & Nutella 6.50", 4.95],
    ["Mixed Ice Cream", "Vanilla, chocolate, strawberry & coconut", 5.5],
  ],
};

const BAR: Record<string, Item[]> = {
  Cocktails: [
    ["Mojito", "Classic, strawberry, passion fruit, peach, mango or raspberry", 8.95],
    ["Porn Star Martini", "Vanilla vodka, Passoa, passion fruit & fresh lime", 9.0],
    ["Espresso Martini", "Vodka, Tia Maria & one espresso", 8.0],
    ["Classic Margarita", "Jose Cuervo, Cointreau, fresh lemon & lime", 8.0],
    ["Frozen Margarita", "Strawberry, mango, raspberry, peach, passion fruit or lemon", 8.5],
    ["Long Island Iced Tea", "Vodka, Bacardi, gin, triple sec, sweet & sour, coke", 8.0],
    ["Sex on the Beach", "Vodka, peach schnapps, orange juice & grenadine", 8.0],
    ["Cosmopolitan", "Vodka, Cointreau, cranberry, sweet & sour", 8.0],
    ["Old Fashioned", "Bourbon, bitters, sugar syrup & ice", 8.0],
    ["Negroni", "Gin, Campari & Martini Rosso on the rocks", 8.0],
    ["Mai Tai", "Light & dark rum, pineapple, blue curaçao, amaretto & lime", 8.0],
    ["Daiquiri", "Strawberry, passion fruit, peach, mango or raspberry", 8.95],
    ["Whisky Sour", "Jack Daniels, sweet & sour, egg white", 8.0],
    ["Tequila Sunrise", "Jose Cuervo, orange juice & grenadine", 8.0],
    ["Aperol Spritz", null, 7.5],
    ["The Colonial Bathtub", "Raspberry vodka, raspberry liquor, Sprite, crushed ice & squirty cream", 10.0],
  ],
  "Ice Cream Cocktails": [
    ["Piña Colada", "Rum, Malibu, coconut ice cream & pineapple juice", 9.95],
    ["Strawberry Shortcake", "Disaronno, strawberries & vanilla ice cream", 9.95],
    ["Burnt Almond", "Tia Maria, Disaronno & vanilla ice cream", 9.95],
    ["Frozen Irish Mint", "Baileys, crème de menthe & vanilla ice cream", 9.95],
    ["Frozen Black Irish", "Vodka, Tia Maria, Baileys & vanilla ice cream", 9.95],
  ],
  "Champagne Cocktails": [
    ["Kir Royal", "Raspberry liquor & cava", 7.95],
    ["Buck's Fizz", "Orange juice & cava", 7.95],
    ["Bellini", "Peach purée, Archers & cava or prosecco", 7.95],
    ["Rossini", "Strawberry purée & cava or prosecco", 7.95],
    ["Champagne Cocktail", "Brandy, bitters & champagne", 9.95],
  ],
  "Draught Beer & Cider": [
    ["Dorada", "Pint", 3.2],
    ["Budweiser", "Pint", 4.5],
    ["Heineken", "Pint", 4.5],
    ["Stella Artois", "Pint", 4.5],
    ["Peroni", "Pint", 4.5],
    ["Guinness", "Pint", 6.0],
    ["Old Speckled Hen", "Pint", 6.0],
    ["Thatcher's", "Pint", 5.0],
    ["Kopparberg", "Pint", 5.0],
  ],
  "Wine & Fizz": [
    ["House White, Red or Rosé", "175ml 3.95 · 250ml 5.25", 3.95],
    ["Rioja Dry", "Bottle", 18.95],
    ["Pinot Grigio", "Bottle", 20.95],
    ["Sauvignon Blanc", "Bottle", 20.95],
    ["Rioja Tempranillo", "Bottle", 18.95],
    ["Coto de Imaz Reserva", "Bottle", 22.45],
    ["Crater Crianza", "Tacoronte-Acentejo, Tenerife", 32.0],
    ["Glass of Cava or Prosecco", null, 5.0],
    ["House Champagne", "Bottle", 40.0],
    ["Moët & Chandon", "Bottle", 60.0],
    ["Veuve Clicquot Rosé", "Bottle", 75.0],
  ],
  "Sangria & Jugs": [
    ["Red Wine Sangria", "Glass 5.60 · 1L jug 18.95", 5.6],
    ["Champagne Sangria", "Glass 6.00 · 1L jug 20.95", 6.0],
    ["Pimm's", "Mix 7.50 · 1L jug 15.95", 7.5],
  ],
  "Coffee & After Dinner": [
    ["Barraquito", "The Canarian classic", 3.95],
    ["Irish Coffee", "Jameson", 6.25],
    ["Calypso Coffee", "Tia Maria", 6.25],
    ["Coffee Dream", "Baileys", 6.25],
    ["Cappuccino", null, 3.0],
    ["Latte", null, 3.5],
  ],
};

async function main() {
  await seedPlans();

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      name: "The Colonial",
      tagline: "Our happy place.",
      timezone: "Atlantic/Canary",
      address: "CC Lagos de Fañabé, Local 60-62, Playa Fañabé, 38660 Costa Adeje, Tenerife",
      phone: "+34 922 715 200",
      brandColor: "#d4af37",
      welcomeMessage:
        "The warmest of welcomes to The Colonial — our happy place! I'm Gary the Monkey. I'd be happy to help with our menus, opening hours, entertainment or anything else about Colonial. To book a table, just use the booking form further down this page. What can I help with?",
      maxPartySize: 12,
      defaultReservationMinutes: 90,
      onboardingCompletedAt: new Date(),
    },
    update: {
      name: "The Colonial",
      tagline: "Our happy place.",
      address: "CC Lagos de Fañabé, Local 60-62, Playa Fañabé, 38660 Costa Adeje, Tenerife",
      phone: "+34 922 715 200",
      brandColor: "#d4af37",
      welcomeMessage:
        "The warmest of welcomes to The Colonial — our happy place! I'm Gary the Monkey. I'd be happy to help with our menus, opening hours, entertainment or anything else about Colonial. To book a table, just use the booking form further down this page. What can I help with?",
      maxPartySize: 12,
      defaultReservationMinutes: 90,
    },
  });

  // Open every day 10:00 – 01:00 (closes past midnight).
  await prisma.openingHour.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.openingHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      restaurantId: restaurant.id,
      dayOfWeek,
      openTime: "10:00",
      closeTime: "01:00",
      isClosed: false,
    })),
  });

  // Dining tables / floor plan are seeded by seedHostFlow() below.

  await prisma.faqEntry.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.faqEntry.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        category: "Entertainment",
        question: "Is there live entertainment?",
        answer:
          "Every night — award-winning local artists performing pop, Motown and soul. We also show all the live sports.",
        sortOrder: 1,
      },
      {
        restaurantId: restaurant.id,
        category: "Events",
        question: "Can you host birthdays or special occasions?",
        answer:
          "Yes — we regularly host birthday parties, anniversaries and other functions. Call us on +34 922 715 200 to arrange.",
        sortOrder: 2,
      },
      {
        restaurantId: restaurant.id,
        category: "Reservations",
        question: "Do you take walk-ins?",
        answer: "Always — but booking ahead guarantees your table, especially for evening entertainment.",
        sortOrder: 3,
      },
      {
        restaurantId: restaurant.id,
        category: "General",
        question: "Do you serve breakfast?",
        answer: "Yes, full English and Scottish breakfasts are served daily until 1pm.",
        sortOrder: 4,
      },
      {
        restaurantId: restaurant.id,
        category: "General",
        question: "Do you have a children's menu?",
        answer: "Yes — a full children's menu with breakfasts, mains, omelettes and pasta.",
        sortOrder: 5,
      },
      {
        restaurantId: restaurant.id,
        category: "General",
        question: "Are there vegetarian and gluten-free options?",
        answer:
          "Yes — Quorn dishes, vegetarian pizzas and nachos, plus gluten-free bread and pasta available on request.",
        sortOrder: 6,
      },
      {
        restaurantId: restaurant.id,
        category: "General",
        question: "Where are you located?",
        answer:
          "Centro Comercial Lagos de Fañabé, Local 60-62, right by Playa Fañabé in Costa Adeje.",
        sortOrder: 7,
      },
    ],
  });

  await prisma.menuItem.deleteMany({ where: { restaurantId: restaurant.id } });
  let sortOrder = 0;
  const menuRows = [
    ...Object.entries(KITCHEN).map(([category, items]) => ({ section: "Kitchen", category, items })),
    ...Object.entries(BAR).map(([category, items]) => ({ section: "Bar", category, items })),
  ].flatMap(({ section, category, items }) =>
    items.map(([name, description, price]) => ({
      restaurantId: restaurant.id,
      // "Section|Category" lets the homepage split Kitchen vs Bar and group
      // by category while keeping the single-string category column.
      category: `${section}|${category}`,
      name,
      description,
      price,
      sortOrder: sortOrder++,
    }))
  );
  await prisma.menuItem.createMany({ data: menuRows });

  await seedHostFlow(restaurant.id);
  await upsertAccount(restaurant.id, "colonial@hostflow.app", "colonial123", "Colonial Front Desk", "OWNER");
  // The Colonial is an early partner restaurant — complimentary via the same
  // reusable grantComplimentary() any admin/registration flow can call.
  await seedBilling(restaurant.id, { complimentary: true, reason: "Early partner restaurant" });

  // ── Second demo venue, to prove multi-tenancy: its own login → own floor ──
  const harbour = await prisma.restaurant.upsert({
    where: { slug: "the-harbour" },
    create: {
      slug: "the-harbour",
      name: "The Harbour",
      tagline: "Dockside dining.",
      timezone: "Atlantic/Canary",
      address: "Marina Quay, Los Cristianos, Tenerife",
      phone: "+34 922 000 000",
      brandColor: "#0ea5e9",
      maxPartySize: 12,
      defaultReservationMinutes: 90,
      onboardingCompletedAt: new Date(),
    },
    update: { name: "The Harbour", tagline: "Dockside dining." },
  });
  await prisma.openingHour.deleteMany({ where: { restaurantId: harbour.id } });
  await prisma.openingHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      restaurantId: harbour.id,
      dayOfWeek,
      openTime: "12:00",
      closeTime: "23:30",
      isClosed: false,
    })),
  });
  await seedHostFlow(harbour.id);
  await upsertAccount(harbour.id, "harbour@hostflow.app", "harbour123", "Harbour Host Stand", "OWNER");
  // Ordinary paying customer: a real 30-day trial, proving the non-comp path.
  await seedBilling(harbour.id, { complimentary: false });

  console.log(
    `Seeded "${restaurant.name}" and "${harbour.name}" with live floor plans + per-bar logins ` +
      `(colonial@hostflow.app / colonial123, harbour@hostflow.app / harbour123)`
  );
}

// ── Host Flow seed ─────────────────────────────────────────────────────────
// Wipes and recreates the operational floor state so a fresh `db:seed` always
// produces a believable "live service" relative to the current clock — handy
// for demos and for exercising the realtime dashboard.

const MIN = 60 * 1000;
const now = () => new Date();
const minsFromNow = (m: number) => new Date(Date.now() + m * MIN);

// Real Colonial floor plan, transcribed from the venue's POS.
//   Main Room  = Main Terrace (left) · Restaurant (top) · Back Terrace (right) · Bar (bottom)
//   Lounge     = separate room (tables 30–50, 300-series)
// cx/cy are the table CENTRE in that room's own coordinate space; w/h are
// derived from shape/seats unless overridden (dims() below).
type SeedTable = {
  n: number;
  seats: number;
  shape: "ROUND" | "RECT" | "SQUARE";
  section: string;
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

const FLOOR: SeedTable[] = [
  // ── MAIN ROOM · Main Terrace (LEFT column) ──
  { n: 13, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 95, cy: 150 },
  { n: 11, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 240, cy: 185 },
  { n: 12, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 150, cy: 300 },
  { n: 10, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 290, cy: 320 },
  { n: 14, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 95, cy: 420 },
  { n: 21, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 250, cy: 470 },
  { n: 15, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 110, cy: 540 },
  { n: 20, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 250, cy: 600 },
  { n: 16, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 110, cy: 660 },
  { n: 19, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 255, cy: 720 },
  { n: 170, seats: 6, shape: "ROUND", section: "Main Terrace", cx: 140, cy: 835 },
  { n: 17, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 110, cy: 945 },
  { n: 18, seats: 4, shape: "SQUARE", section: "Main Terrace", cx: 255, cy: 945 },
  // ── MAIN ROOM · Restaurant (TOP-CENTRE) ──
  { n: 1, seats: 4, shape: "SQUARE", section: "Restaurant", cx: 490, cy: 195 },
  { n: 2, seats: 4, shape: "SQUARE", section: "Restaurant", cx: 620, cy: 200 },
  { n: 3, seats: 4, shape: "SQUARE", section: "Restaurant", cx: 745, cy: 200 },
  { n: 4, seats: 4, shape: "SQUARE", section: "Restaurant", cx: 865, cy: 205 },
  { n: 5, seats: 6, shape: "RECT", section: "Restaurant", cx: 900, cy: 345 },
  { n: 9, seats: 4, shape: "SQUARE", section: "Restaurant", cx: 500, cy: 480 },
  { n: 8, seats: 6, shape: "RECT", section: "Restaurant", cx: 640, cy: 470, w: 92, h: 150 },
  { n: 7, seats: 6, shape: "RECT", section: "Restaurant", cx: 770, cy: 475, w: 92, h: 150 },
  { n: 6, seats: 6, shape: "RECT", section: "Restaurant", cx: 880, cy: 470, w: 92, h: 150 },
  // ── MAIN ROOM · Bar (BOTTOM-CENTRE) — 100-series are bar stools ──
  { n: 120, seats: 4, shape: "ROUND", section: "Bar", cx: 490, cy: 725 },
  { n: 101, seats: 2, shape: "ROUND", section: "Bar", cx: 580, cy: 700, w: 38, h: 38 },
  { n: 102, seats: 2, shape: "ROUND", section: "Bar", cx: 580, cy: 752, w: 38, h: 38 },
  { n: 103, seats: 2, shape: "ROUND", section: "Bar", cx: 622, cy: 800, w: 38, h: 38 },
  { n: 104, seats: 2, shape: "ROUND", section: "Bar", cx: 660, cy: 865, w: 38, h: 38 },
  { n: 105, seats: 2, shape: "ROUND", section: "Bar", cx: 712, cy: 865, w: 38, h: 38 },
  { n: 106, seats: 2, shape: "ROUND", section: "Bar", cx: 764, cy: 865, w: 38, h: 38 },
  { n: 107, seats: 2, shape: "ROUND", section: "Bar", cx: 816, cy: 865, w: 38, h: 38 },
  { n: 108, seats: 2, shape: "ROUND", section: "Bar", cx: 868, cy: 865, w: 38, h: 38 },
  { n: 109, seats: 2, shape: "ROUND", section: "Bar", cx: 920, cy: 865, w: 38, h: 38 },
  { n: 110, seats: 2, shape: "ROUND", section: "Bar", cx: 560, cy: 945, w: 38, h: 38 },
  { n: 111, seats: 2, shape: "ROUND", section: "Bar", cx: 612, cy: 945, w: 38, h: 38 },
  { n: 112, seats: 2, shape: "ROUND", section: "Bar", cx: 664, cy: 945, w: 38, h: 38 },
  { n: 113, seats: 2, shape: "ROUND", section: "Bar", cx: 730, cy: 945, w: 38, h: 38 },
  { n: 114, seats: 2, shape: "ROUND", section: "Bar", cx: 782, cy: 945, w: 38, h: 38 },
  { n: 125, seats: 2, shape: "SQUARE", section: "Bar", cx: 860, cy: 940, w: 62, h: 70 },
  { n: 130, seats: 2, shape: "RECT", section: "Bar", cx: 935, cy: 940, w: 72, h: 62 },
  // ── MAIN ROOM · Back Terrace (RIGHT column) ──
  { n: 28, seats: 6, shape: "SQUARE", section: "Back Terrace", cx: 1140, cy: 200 },
  { n: 29, seats: 2, shape: "RECT", section: "Back Terrace", cx: 1270, cy: 210 },
  { n: 500, seats: 4, shape: "ROUND", section: "Back Terrace", cx: 1375, cy: 200 },
  { n: 26, seats: 4, shape: "SQUARE", section: "Back Terrace", cx: 1140, cy: 360 },
  { n: 27, seats: 4, shape: "SQUARE", section: "Back Terrace", cx: 1255, cy: 375 },
  { n: 400, seats: 4, shape: "ROUND", section: "Back Terrace", cx: 1385, cy: 380 },
  { n: 24, seats: 4, shape: "SQUARE", section: "Back Terrace", cx: 1130, cy: 520 },
  { n: 25, seats: 4, shape: "SQUARE", section: "Back Terrace", cx: 1245, cy: 530 },
  { n: 300, seats: 4, shape: "ROUND", section: "Back Terrace", cx: 1375, cy: 560 },
  { n: 140, seats: 6, shape: "ROUND", section: "Back Terrace", cx: 1110, cy: 690 },
  { n: 22, seats: 4, shape: "SQUARE", section: "Back Terrace", cx: 1240, cy: 700 },
  { n: 23, seats: 4, shape: "SQUARE", section: "Back Terrace", cx: 1345, cy: 710 },
  { n: 135, seats: 4, shape: "ROUND", section: "Back Terrace", cx: 1120, cy: 835 },
  { n: 200, seats: 4, shape: "ROUND", section: "Back Terrace", cx: 1360, cy: 850 },

  // ── LOUNGE (separate room) ──
  { n: 33, seats: 2, shape: "RECT", section: "Lounge", cx: 390, cy: 160, w: 52, h: 104 },
  { n: 32, seats: 2, shape: "RECT", section: "Lounge", cx: 845, cy: 165, w: 52, h: 104 },
  { n: 36, seats: 4, shape: "SQUARE", section: "Lounge", cx: 370, cy: 365 },
  { n: 360, seats: 2, shape: "RECT", section: "Lounge", cx: 548, cy: 380, w: 52, h: 104 },
  { n: 35, seats: 4, shape: "SQUARE", section: "Lounge", cx: 555, cy: 690 },
  { n: 350, seats: 2, shape: "RECT", section: "Lounge", cx: 722, cy: 670, w: 52, h: 104 },
  { n: 37, seats: 4, shape: "SQUARE", section: "Lounge", cx: 415, cy: 920 },
  { n: 370, seats: 2, shape: "RECT", section: "Lounge", cx: 562, cy: 915, w: 52, h: 104 },
  { n: 31, seats: 4, shape: "ROUND", section: "Lounge", cx: 838, cy: 1000 },
  { n: 30, seats: 4, shape: "SQUARE", section: "Lounge", cx: 625, cy: 1055 },
  { n: 40, seats: 4, shape: "ROUND", section: "Lounge", cx: 1000, cy: 205 },
  { n: 41, seats: 4, shape: "ROUND", section: "Lounge", cx: 1200, cy: 185 },
  { n: 42, seats: 4, shape: "ROUND", section: "Lounge", cx: 1358, cy: 190 },
  { n: 43, seats: 4, shape: "ROUND", section: "Lounge", cx: 1472, cy: 190 },
  { n: 44, seats: 4, shape: "ROUND", section: "Lounge", cx: 1598, cy: 190 },
  { n: 46, seats: 4, shape: "ROUND", section: "Lounge", cx: 1428, cy: 365 },
  { n: 45, seats: 4, shape: "ROUND", section: "Lounge", cx: 1658, cy: 365 },
  { n: 49, seats: 4, shape: "ROUND", section: "Lounge", cx: 1508, cy: 592 },
  { n: 50, seats: 4, shape: "ROUND", section: "Lounge", cx: 1692, cy: 602 },
  { n: 47, seats: 4, shape: "ROUND", section: "Lounge", cx: 1492, cy: 820 },
  { n: 48, seats: 4, shape: "ROUND", section: "Lounge", cx: 1692, cy: 815 },
];

const SECTIONS = [
  { name: "Main Terrace", color: "#10b981", sortOrder: 0, isOutdoor: true, room: "Main Room" },
  { name: "Restaurant", color: "#d4af37", sortOrder: 1, isOutdoor: false, room: "Main Room" },
  { name: "Back Terrace", color: "#14b8a6", sortOrder: 2, isOutdoor: true, room: "Main Room" },
  { name: "Bar", color: "#8b5cf6", sortOrder: 3, isOutdoor: false, room: "Main Room" },
  { name: "Lounge", color: "#f43f5e", sortOrder: 4, isOutdoor: false, room: "Lounge" },
];

const STAFF = [
  { name: "Elena Vargas", role: "MANAGER", color: "#e11d48", section: null as string | null },
  { name: "Marcus Bell", role: "HOST", color: "#0ea5e9", section: null },
  { name: "Sofia Ramos", role: "SERVER", color: "#10b981", section: "Main Terrace" },
  { name: "Diego Torres", role: "SERVER", color: "#d4af37", section: "Restaurant" },
  { name: "Nadia Haddad", role: "SERVER", color: "#14b8a6", section: "Back Terrace" },
  { name: "Liam Walsh", role: "SERVER", color: "#8b5cf6", section: "Bar" },
  { name: "Priya Nair", role: "SERVER", color: "#f43f5e", section: "Lounge" },
];

async function seedHostFlow(restaurantId: string) {
  // Clean slate for operational data (idempotent re-seed).
  await prisma.tableStatusHistory.deleteMany({ where: { restaurantId } });
  await prisma.notification.deleteMany({ where: { restaurantId } });
  await prisma.tableSession.deleteMany({ where: { restaurantId } });
  await prisma.walkin.deleteMany({ where: { restaurantId } });
  await prisma.reservation.deleteMany({ where: { restaurantId } });
  await prisma.diningTable.deleteMany({ where: { restaurantId } });
  await prisma.staffMember.deleteMany({ where: { restaurantId } });
  await prisma.section.deleteMany({ where: { restaurantId } });

  // Settings
  await prisma.restaurantSettings.upsert({
    where: { restaurantId },
    create: { restaurantId },
    update: {},
  });

  // Sections
  const sectionByName: Record<string, string> = {};
  for (const s of SECTIONS) {
    const row = await prisma.section.create({ data: { restaurantId, ...s } });
    sectionByName[s.name] = row.id;
  }

  // Staff
  const staffByName: Record<string, string> = {};
  for (const s of STAFF) {
    const row = await prisma.staffMember.create({
      data: {
        restaurantId,
        name: s.name,
        role: s.role,
        color: s.color,
        sectionId: s.section ? sectionByName[s.section] : null,
      },
    });
    staffByName[s.name] = row.id;
  }
  const serverForSection: Record<string, string> = {
    "Main Terrace": staffByName["Sofia Ramos"],
    Restaurant: staffByName["Diego Torres"],
    "Back Terrace": staffByName["Nadia Haddad"],
    Bar: staffByName["Liam Walsh"],
    Lounge: staffByName["Priya Nair"],
  };

  // Tables
  const tableByNumber: Record<number, { id: string; seats: number; section: string }> = {};
  for (const t of FLOOR) {
    const [w, h] = dims(t);
    const capacityMin = t.seats <= 2 ? 1 : t.seats <= 4 ? 2 : 4;
    const row = await prisma.diningTable.create({
      data: {
        restaurantId,
        name: `Table ${t.n}`,
        tableNumber: t.n,
        capacityMin,
        capacityMax: t.seats,
        shape: t.shape,
        x: t.cx - w / 2,
        y: t.cy - h / 2,
        width: w,
        height: h,
        status: "AVAILABLE",
        sectionId: sectionByName[t.section],
        serverId: serverForSection[t.section] ?? null,
      },
    });
    tableByNumber[t.n] = { id: row.id, seats: t.seats, section: t.section };
  }

  const setStatus = (n: number, status: string, note?: string) =>
    Promise.all([
      prisma.diningTable.update({ where: { id: tableByNumber[n].id }, data: { status } }),
      prisma.tableStatusHistory.create({
        data: { restaurantId, tableId: tableByNumber[n].id, toStatus: status, note },
      }),
    ]);

  // Helper: seat a party at a table (creates an OCCUPIED session).
  async function seat(
    n: number,
    guestName: string,
    partySize: number,
    minsAgo: number,
    opts: { vip?: boolean; occasion?: string; bill?: number; durationMin?: number; waitingForOutdoor?: boolean } = {}
  ) {
    const t = tableByNumber[n];
    const seatedAt = new Date(Date.now() - minsAgo * MIN);
    const duration = opts.durationMin ?? 90;
    await prisma.tableSession.create({
      data: {
        restaurantId,
        tableId: t.id,
        guestName,
        partySize,
        status: "SEATED",
        source: "RESERVATION",
        seatedAt,
        expectedFinishAt: new Date(seatedAt.getTime() + duration * MIN),
        isVip: opts.vip ?? false,
        occasion: opts.occasion,
        currentBill: opts.bill,
        waitingForOutdoor: opts.waitingForOutdoor ?? false,
        serverId: (await prisma.diningTable.findUnique({ where: { id: t.id } }))?.serverId ?? null,
      },
    });
    await setStatus(n, "OCCUPIED");
  }

  // Helper: create an upcoming reservation and mark the held table RESERVED.
  async function reserve(
    n: number,
    name: string,
    partySize: number,
    inMins: number,
    opts: { vip?: boolean; occasion?: string; pref?: string; status?: string } = {}
  ) {
    const t = tableByNumber[n];
    await prisma.reservation.create({
      data: {
        restaurantId,
        tableId: t.id,
        customerName: name,
        partySize,
        reservationTime: minsFromNow(inMins),
        durationMinutes: 90,
        status: opts.status ?? "CONFIRMED",
        source: "WEB_FORM",
        isVip: opts.vip ?? false,
        occasion: opts.occasion,
        seatingPreference: opts.pref,
      },
    });
  }

  // ── Live service snapshot (real tables) ──────────────────────────────────
  // Occupied (mid-meal)
  await seat(1, "Anderson", 4, 55, { bill: 84.5 });
  await seat(3, "Okafor", 4, 35, { occasion: "Birthday", bill: 46.0 });
  await seat(5, "Chen", 5, 20, { bill: 60.0 });
  await seat(8, "Whitmore", 6, 40, { bill: 118.75, durationMin: 120 });
  await seat(28, "Rossi", 6, 70, { bill: 132.0 });
  await seat(35, "Kaur", 4, 15, { bill: 18.0 }); // Lounge
  // Overrunning table (seated well past average dining time) → drives a notification
  await seat(140, "Petersen", 6, 135, { occasion: "Retirement", bill: 240.0, durationMin: 90 });
  // Parties at the bar, waiting for an outdoor terrace table to eat.
  await seat(120, "Brennan", 4, 25, { bill: 42.0, waitingForOutdoor: true });
  await seat(108, "Marlowe", 2, 30, { bill: 20.0, waitingForOutdoor: true });

  // Reserved (upcoming)
  await reserve(2, "Nguyen", 4, 45, { pref: "Restaurant" });
  await reserve(9, "Silva", 4, 60, {});
  await reserve(6, "Fernández", 6, 75, { occasion: "Anniversary" });
  await reserve(24, "Corporate — Nortech", 4, 90, { vip: true, occasion: "Business" });
  // Arriving soon (within 15 min) → orange
  await reserve(4, "Hughes", 4, 8, { pref: "Back Terrace" });
  await setStatus(4, "ARRIVING_SOON");
  // VIP arriving soon
  await reserve(26, "Al-Farsi", 4, 12, { vip: true });
  await setStatus(26, "ARRIVING_SOON");
  // Late reservation (booked 18 min ago, never arrived) → purple
  await prisma.reservation.create({
    data: {
      restaurantId,
      tableId: tableByNumber[27].id,
      customerName: "Blackwood",
      partySize: 4,
      reservationTime: new Date(Date.now() - 18 * MIN),
      durationMinutes: 90,
      status: "CONFIRMED",
      source: "WEB_FORM",
    },
  });
  await setStatus(27, "LATE");

  // Set RESERVED status on the plain upcoming holds
  for (const n of [2, 9, 6, 24]) await setStatus(n, "RESERVED");

  // Dirty / cleaning / blocked
  await setStatus(11, "DIRTY", "Guests just left, needs bussing");
  await setStatus(15, "DIRTY");
  await setStatus(12, "CLEANING");
  await setStatus(29, "BLOCKED", "Wobbly leg — maintenance");

  // Walk-ins on the waitlist
  await prisma.walkin.createMany({
    data: [
      { restaurantId, name: "Morgan", partySize: 2, priority: "NORMAL", quotedWaitMinutes: 15, createdAt: new Date(Date.now() - 6 * MIN) },
      { restaurantId, name: "Delgado", partySize: 4, priority: "HIGH", quotedWaitMinutes: 25, notes: "Regular", createdAt: new Date(Date.now() - 22 * MIN) },
      { restaurantId, name: "Thompson", partySize: 2, priority: "NORMAL", quotedWaitMinutes: 20, accessibilityNeeds: "Step-free access", createdAt: new Date(Date.now() - 12 * MIN) },
      { restaurantId, name: "Ivanov", partySize: 6, priority: "VIP", quotedWaitMinutes: 35, notes: "Hotel guest, VIP", createdAt: new Date(Date.now() - 3 * MIN) },
    ],
  });

  // Seed notifications (most recent first via createdAt)
  await prisma.notification.createMany({
    data: [
      { restaurantId, type: "WAITING_OUTDOOR", severity: "INFO", title: "Waiting to move outside", body: "Brennan (Table 120) & Marlowe (Table 108) are at the bar waiting for an outdoor table", createdAt: new Date(Date.now() - 1 * MIN) },
      { restaurantId, type: "RESERVATION_LATE", severity: "WARNING", title: "Reservation late", body: "Blackwood (4) is 18 min late — Table 27", tableId: tableByNumber[27].id, createdAt: new Date(Date.now() - 2 * MIN) },
      { restaurantId, type: "DINING_OVERRUN", severity: "WARNING", title: "Table over average dining time", body: "Table 140 (Petersen) has exceeded 90 min", tableId: tableByNumber[140].id, createdAt: new Date(Date.now() - 4 * MIN) },
      { restaurantId, type: "WALKIN_WAITING", severity: "INFO", title: "Walk-in waiting 22 min", body: "Delgado (4) — quoted 25 min", createdAt: new Date(Date.now() - 5 * MIN) },
      { restaurantId, type: "TABLE_DIRTY", severity: "INFO", title: "Table needs cleaning", body: "Table 11 and Table 15 need bussing", createdAt: new Date(Date.now() - 8 * MIN) },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
