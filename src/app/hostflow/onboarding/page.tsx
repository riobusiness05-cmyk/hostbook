import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerHostSession } from "@/lib/hostAuth";
import { OnboardingWizard } from "@/components/host/OnboardingWizard";

export const dynamic = "force-dynamic";

// Shown once, right after signup, before /host is reachable — see
// src/app/host/page.tsx's onboardingCompletedAt redirect. Already-onboarded
// restaurants are bounced straight to their floor instead of re-running this.
export default async function OnboardingPage() {
  const session = getServerHostSession();
  if (!session) redirect("/hostflow/login");

  const restaurant = await prisma.restaurant.findUnique({ where: { id: session.restaurantId } });
  if (!restaurant) redirect("/hostflow/login");
  if (restaurant.onboardingCompletedAt) redirect("/host");

  return <OnboardingWizard restaurantName={restaurant.name} />;
}
