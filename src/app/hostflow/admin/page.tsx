import { prisma } from "@/lib/prisma";
import { AdminDashboard, type RestaurantRow } from "@/components/platform-admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: { subscription: { include: { plan: true } } },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  const rows: RestaurantRow[] = restaurants.map((r) => {
    const sub = r.subscription;
    const effectiveStatus = sub?.isComplimentary
      ? "COMPLIMENTARY"
      : sub?.status === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt.getTime() < now
      ? "EXPIRED"
      : sub?.status ?? "TRIAL";
    const trialDaysRemaining =
      effectiveStatus === "TRIAL" && sub?.trialEndsAt
        ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now) / (24 * 60 * 60000)))
        : null;

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt.toISOString(),
      status: effectiveStatus,
      planName: sub?.plan?.name ?? null,
      monthlyPriceCents: sub?.plan?.monthlyPriceCents ?? null,
      trialDaysRemaining,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      isComplimentary: sub?.isComplimentary ?? false,
    };
  });

  const mrrCents = rows
    .filter((r) => r.status === "ACTIVE")
    .reduce((sum, r) => sum + (r.monthlyPriceCents ?? 0), 0);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return <AdminDashboard restaurants={rows} mrrCents={mrrCents} counts={counts} />;
}
