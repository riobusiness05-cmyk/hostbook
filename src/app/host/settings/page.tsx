import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerHostSession } from "@/lib/hostAuth";
import { getBillingState, listActivePlans } from "@/lib/billing/subscription";
import { BillingSection } from "@/components/host/BillingSection";

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

  const [billing, plans] = await Promise.all([
    getBillingState(restaurant.id),
    listActivePlans(),
  ]);

  return (
    <BillingSection
      initialBilling={billing}
      initialPlans={plans}
      restaurantName={restaurant.name}
      blocked={searchParams.blocked === "1"}
      checkoutResult={searchParams.checkout === "success" || searchParams.checkout === "cancelled" ? searchParams.checkout : null}
    />
  );
}
