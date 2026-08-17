import {
  effectiveStatus,
  getPlatformMetrics,
  getRestaurantGrowthSeries,
  getBookingVolumeSeries,
  getMrrSeries,
  getRecentRestaurants,
  getMostActiveRestaurants,
  getRecentBookings,
  getRecentFailedPayments,
} from "@/lib/platformAdmin";
import { prisma } from "@/lib/prisma";
import { AdminDashboard, type RestaurantRow } from "@/components/platform-admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const [restaurants, metrics, growthSeries, bookingSeries, mrrSeries, recentRestaurants, mostActive, recentBookings, recentFailedPayments] =
    await Promise.all([
      prisma.restaurant.findMany({
        include: { subscription: { include: { plan: true } } },
        orderBy: { createdAt: "desc" },
      }),
      getPlatformMetrics(),
      getRestaurantGrowthSeries(12),
      getBookingVolumeSeries(12),
      getMrrSeries(12),
      getRecentRestaurants(10),
      getMostActiveRestaurants(10),
      getRecentBookings(15),
      getRecentFailedPayments(15),
    ]);

  const rows: RestaurantRow[] = restaurants.map((r) => {
    const sub = r.subscription;
    const status = effectiveStatus(sub);
    const trialDaysRemaining =
      status === "TRIAL" && sub?.trialEndsAt
        ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60000)))
        : null;

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt.toISOString(),
      status,
      planName: sub?.plan?.name ?? null,
      monthlyPriceCents: sub?.plan?.monthlyPriceCents ?? null,
      trialDaysRemaining,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      isComplimentary: sub?.isComplimentary ?? false,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AdminDashboard
      restaurants={rows}
      counts={counts}
      metrics={metrics}
      growthSeries={growthSeries}
      bookingSeries={bookingSeries}
      mrrSeries={mrrSeries}
      recentRestaurants={recentRestaurants}
      mostActive={mostActive}
      recentBookings={recentBookings}
      recentFailedPayments={recentFailedPayments}
    />
  );
}
