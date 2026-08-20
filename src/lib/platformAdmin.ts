import { prisma } from "@/lib/prisma";

// Same "pin the locale, pass the restaurant's real IANA timezone" approach
// as toLocalDateStr/toLocalTimeStr in src/lib/availability.ts, just with a
// friendlier "Aug 17, 8:00 PM" output for this display.
function formatInTimezone(date: Date, timeZone: string): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

/**
 * Cross-restaurant business metrics for the Host Flow operator's own admin
 * dashboard (src/app/hostflow/admin) — distinct from any single restaurant's
 * own floor dashboard. Everything here reads from the local DB only; the
 * Stripe webhook (src/app/api/stripe/webhook/route.ts) already keeps
 * Subscription/BillingEvent fully in sync, so there's no need for a live
 * Stripe API call just to render a dashboard.
 */

type SubForPricing = {
  status: string;
  billingInterval: string;
  plan: { monthlyPriceCents: number; annualPriceCents: number | null } | null;
};

// Annual subs are normalized to a monthly-equivalent price rather than
// summed at full annual value — see the MRR bug this replaced.
function monthlyPriceForSub(sub: SubForPricing): number {
  if (!sub.plan) return 0;
  if (sub.billingInterval === "YEAR") {
    return Math.round((sub.plan.annualPriceCents ?? sub.plan.monthlyPriceCents * 12) / 12);
  }
  return sub.plan.monthlyPriceCents;
}

type SubForStatus = { status: string; isComplimentary: boolean; trialEndsAt: Date | null } | null | undefined;

// Same lazy trial-expiry resolution used elsewhere (see resolveEffectiveStatus
// in src/lib/billing/subscription.ts) — trial expiry isn't written back to the
// row until the daily reconcile-billing cron runs, so reads must account for
// "trial that's actually already over" themselves.
export function effectiveStatus(sub: SubForStatus): string {
  if (!sub) return "TRIAL";
  if (sub.isComplimentary) return "COMPLIMENTARY";
  if (sub.status === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt.getTime() < Date.now()) return "EXPIRED";
  return sub.status;
}

function monthBuckets(months: number, now = new Date()): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1);
    const label = start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    buckets.push({ label, start, end });
  }
  return buckets;
}

export type PlatformMetrics = {
  totalRestaurants: number;
  activeRestaurants: number;
  newRestaurantsThisMonth: number;
  totalStaffAccounts: number;
  totalBookings: number;
  bookingsToday: number;
  bookingsThisWeek: number;
  bookingsThisMonth: number;
  mrrCents: number;
  activeSubscriptions: number;
  trialAccounts: number;
  cancelledSubscriptions: number;
  failedPayments30d: number;
};

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalRestaurants,
    newRestaurantsThisMonth,
    totalStaffAccounts,
    totalBookings,
    bookingsToday,
    bookingsThisWeek,
    bookingsThisMonth,
    allSubs,
    failedPayments30d,
  ] = await Promise.all([
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.account.count(),
    prisma.reservation.count(),
    prisma.reservation.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.reservation.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.reservation.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.subscription.findMany({
      select: { status: true, billingInterval: true, isComplimentary: true, plan: { select: { monthlyPriceCents: true, annualPriceCents: true } } },
    }),
    prisma.billingEvent.count({ where: { type: "PAYMENT_FAILED", createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  const statusCounts: Record<string, number> = {};
  let mrrCents = 0;
  let activeRestaurants = 0;
  for (const s of allSubs) {
    const key = s.isComplimentary ? "COMPLIMENTARY" : s.status;
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    if (s.status === "ACTIVE") mrrCents += monthlyPriceForSub(s);
    if (key === "ACTIVE" || key === "TRIAL" || key === "COMPLIMENTARY") activeRestaurants++;
  }

  return {
    totalRestaurants,
    activeRestaurants,
    newRestaurantsThisMonth,
    totalStaffAccounts,
    totalBookings,
    bookingsToday,
    bookingsThisWeek,
    bookingsThisMonth,
    mrrCents,
    activeSubscriptions: statusCounts["ACTIVE"] ?? 0,
    trialAccounts: statusCounts["TRIAL"] ?? 0,
    cancelledSubscriptions: statusCounts["CANCELLED"] ?? 0,
    failedPayments30d,
  };
}

export type SeriesPoint = { label: string; value: number };

export async function getRestaurantGrowthSeries(months = 12): Promise<SeriesPoint[]> {
  const buckets = monthBuckets(months);
  const rows = await prisma.restaurant.findMany({
    where: { createdAt: { gte: buckets[0].start } },
    select: { createdAt: true },
  });
  return buckets.map((b) => ({
    label: b.label,
    value: rows.filter((r) => r.createdAt >= b.start && r.createdAt <= b.end).length,
  }));
}

export async function getBookingVolumeSeries(months = 12): Promise<SeriesPoint[]> {
  const buckets = monthBuckets(months);
  const rows = await prisma.reservation.findMany({
    where: { createdAt: { gte: buckets[0].start } },
    select: { createdAt: true },
  });
  return buckets.map((b) => ({
    label: b.label,
    value: rows.filter((r) => r.createdAt >= b.start && r.createdAt <= b.end).length,
  }));
}

// Reconstructs historical MRR from the BillingEvent log rather than storing
// a snapshot anywhere new. Assumes a single active plan price (true today —
// there is exactly one paid plan, "professional"); would need revisiting if
// a second paid plan or a price change is ever introduced, since past
// months would then need the *price at the time*, not today's price.
export async function getMrrSeries(months = 12): Promise<SeriesPoint[]> {
  const buckets = monthBuckets(months);
  const plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const monthlyPrice = plan?.monthlyPriceCents ?? 0;

  const events = await prisma.billingEvent.findMany({
    where: { type: { in: ["CHECKOUT_COMPLETED", "SUBSCRIPTION_CREATED", "CANCELLED"] } },
    select: { subscriptionId: true, type: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const startedAt = new Map<string, Date>();
  const cancelledAt = new Map<string, Date>();
  for (const e of events) {
    if (!e.subscriptionId) continue;
    if ((e.type === "CHECKOUT_COMPLETED" || e.type === "SUBSCRIPTION_CREATED") && !startedAt.has(e.subscriptionId)) {
      startedAt.set(e.subscriptionId, e.createdAt);
    }
    if (e.type === "CANCELLED" && !cancelledAt.has(e.subscriptionId)) {
      cancelledAt.set(e.subscriptionId, e.createdAt);
    }
  }

  return buckets.map((b) => {
    let count = 0;
    for (const [subId, start] of startedAt) {
      if (start > b.end) continue;
      const cancelled = cancelledAt.get(subId);
      if (cancelled && cancelled <= b.end) continue;
      count++;
    }
    return { label: b.label, value: (count * monthlyPrice) / 100 };
  });
}

export type RecentRestaurantRow = { id: string; name: string; slug: string; createdAt: string; status: string };

export async function getRecentRestaurants(limit = 10): Promise<RecentRestaurantRow[]> {
  const rows = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { subscription: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    createdAt: r.createdAt.toISOString(),
    status: effectiveStatus(r.subscription),
  }));
}

export type ActiveRestaurantRow = { id: string; name: string; slug: string; bookingCount: number };

export async function getMostActiveRestaurants(limit = 10): Promise<ActiveRestaurantRow[]> {
  const rows = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, _count: { select: { reservations: true } } },
  });
  return rows
    .map((r) => ({ id: r.id, name: r.name, slug: r.slug, bookingCount: r._count.reservations }))
    .sort((a, b) => b.bookingCount - a.bookingCount)
    .slice(0, limit);
}

export type RecentBookingRow = {
  id: string;
  customerName: string;
  restaurantName: string;
  restaurantSlug: string;
  partySize: number;
  reservationTime: string;
  createdAt: string;
  status: string;
};

export async function getRecentBookings(limit = 15): Promise<RecentBookingRow[]> {
  const rows = await prisma.reservation.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { restaurant: { select: { name: true, slug: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    customerName: r.customerName,
    restaurantName: r.restaurant.name,
    restaurantSlug: r.restaurant.slug,
    partySize: r.partySize,
    reservationTime: r.reservationTime.toISOString(),
    createdAt: r.createdAt.toISOString(),
    status: r.status,
  }));
}

export type FailedPaymentRow = { id: string; restaurantId: string; restaurantName: string; createdAt: string; message: string | null };

export async function getRecentFailedPayments(limit = 15): Promise<FailedPaymentRow[]> {
  const rows = await prisma.billingEvent.findMany({
    where: { type: "PAYMENT_FAILED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { restaurant: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    restaurantId: r.restaurant.id,
    restaurantName: r.restaurant.name,
    createdAt: r.createdAt.toISOString(),
    message: r.message,
  }));
}

export type RestaurantDetail = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  createdAt: string;
  owner: { name: string; email: string; role: string; lastLoginAt: string | null } | null;
  status: string;
  planName: string | null;
  monthlyPriceCents: number | null;
  billingInterval: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  isComplimentary: boolean;
  tableCount: number;
  totalBookings: number;
  bookingsThisMonth: number;
  // Pre-formatted in the restaurant's own timezone (not UTC) — a booking is
  // for whatever time the guest picked *locally*, and displaying the raw
  // UTC instant instead would silently shift it by the timezone offset.
  recentBookings: { id: string; customerName: string; partySize: number; reservationTimeLabel: string; status: string }[];
};

export async function getRestaurantDetail(restaurantId: string): Promise<RestaurantDetail | null> {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      subscription: { include: { plan: true } },
      accounts: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { tables: true, reservations: true } },
    },
  });
  if (!restaurant) return null;

  const [bookingsThisMonth, recentBookings] = await Promise.all([
    prisma.reservation.count({ where: { restaurantId, createdAt: { gte: startOfMonth } } }),
    prisma.reservation.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, customerName: true, partySize: true, reservationTime: true, status: true },
    }),
  ]);

  const owner = restaurant.accounts[0];
  const sub = restaurant.subscription;

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    email: restaurant.email,
    createdAt: restaurant.createdAt.toISOString(),
    owner: owner ? { name: owner.name, email: owner.email, role: owner.role, lastLoginAt: owner.lastLoginAt?.toISOString() ?? null } : null,
    status: effectiveStatus(sub),
    planName: sub?.plan?.name ?? null,
    // Only a real ACTIVE (paying) subscription actually contributes to MRR —
    // complimentary/trial restaurants show $0 here even though they're on a
    // priced plan, matching how the aggregate MRR stat is computed.
    monthlyPriceCents: sub && sub.status === "ACTIVE" ? monthlyPriceForSub(sub) : 0,
    billingInterval: sub?.billingInterval ?? "MONTH",
    trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    stripeCustomerId: sub?.stripeCustomerId ?? null,
    isComplimentary: sub?.isComplimentary ?? false,
    tableCount: restaurant._count.tables,
    totalBookings: restaurant._count.reservations,
    bookingsThisMonth,
    recentBookings: recentBookings.map((r) => ({
      id: r.id,
      customerName: r.customerName,
      partySize: r.partySize,
      reservationTimeLabel: formatInTimezone(r.reservationTime, restaurant.timezone),
      status: r.status,
    })),
  };
}
