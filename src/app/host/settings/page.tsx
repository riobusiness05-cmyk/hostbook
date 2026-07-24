import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerHostSession } from "@/lib/hostAuth";
import { getBillingState, listActivePlans, TRIAL_DAYS } from "@/lib/billing/subscription";
import { getSettings } from "@/lib/hostflow/floor";
import { SettingsShell } from "@/components/host/SettingsShell";

export const dynamic = "force-dynamic";

// Deliberately NOT gated on billing access (unlike /host) — an
// expired/cancelled account must still be able to reach this page to fix
// their subscription. Only the session is required.
export default async function HostSettingsPage({
  searchParams,
}: {
  searchParams: { blocked?: string; checkout?: string };
}) {
  const session = getServerHostSession();
  if (!session) redirect("/hostflow/login");

  const restaurant = await prisma.restaurant.findUnique({ where: { id: session.restaurantId } });
  if (!restaurant) redirect("/hostflow/login");

  const [billing, plans, settings, hours, tables] = await Promise.all([
    getBillingState(restaurant.id),
    listActivePlans(),
    getSettings(restaurant.id),
    prisma.openingHour.findMany({ where: { restaurantId: restaurant.id }, orderBy: { dayOfWeek: "asc" } }),
    prisma.diningTable.findMany({
      where: { restaurantId: restaurant.id },
      include: { section: true },
      orderBy: { tableNumber: "asc" },
    }),
  ]);

  return (
    <SettingsShell
      restaurantName={restaurant.name}
      initialBilling={billing}
      initialPlans={plans}
      trialDays={TRIAL_DAYS}
      initialSettings={settings}
      initialHours={hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed }))}
      initialTables={tables.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        name: t.name,
        capacityMin: t.capacityMin,
        capacityMax: t.capacityMax,
        isActive: t.isActive,
        sectionName: t.section?.name ?? null,
      }))}
      blocked={searchParams.blocked === "1"}
      checkoutResult={searchParams.checkout === "success" || searchParams.checkout === "cancelled" ? searchParams.checkout : null}
    />
  );
}
