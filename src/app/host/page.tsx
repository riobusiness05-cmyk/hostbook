import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerHostSession } from "@/lib/hostAuth";
import { getFloorState } from "@/lib/hostflow/floor";
import { getBillingState } from "@/lib/billing/subscription";
import { HostApp } from "@/components/host/HostApp";

export const dynamic = "force-dynamic";

// Server-render the first paint with the logged-in bar's floor snapshot, then
// the client takes over via SSE. The tenant comes from the session, so two
// different logins render two different floors from the same route.
//
// Billing enforcement lives here (not in host/layout.tsx) so a
// lapsed/cancelled account can still reach /host/settings to fix it — the
// layout only checks the session; this page is what redirects away when
// there's genuinely no access.
export default async function HostPage() {
  const session = getServerHostSession();
  if (!session) redirect("/hostflow/login");

  const restaurant = await prisma.restaurant.findUnique({ where: { id: session.restaurantId } });
  if (!restaurant) redirect("/hostflow/login");

  const billing = await getBillingState(restaurant.id);
  if (!billing.hasAccess) redirect("/host/settings?blocked=1");

  const initialState = await getFloorState(restaurant.id);
  return <HostApp initialState={initialState} restaurantName={restaurant.name} billing={billing} />;
}
