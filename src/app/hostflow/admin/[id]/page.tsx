import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRestaurantDetail } from "@/lib/platformAdmin";
import { RestaurantDetail } from "@/components/platform-admin/RestaurantDetail";

export const dynamic = "force-dynamic";

// Overrides the root layout's default metadata (the active single-tenant
// restaurant's own name/tagline) — this page is Host Flow's own platform
// tool inspecting a tenant, not that tenant's own page.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const detail = await getRestaurantDetail(params.id);
  return { title: detail ? `${detail.name} — Host Flow admin` : "Host Flow admin" };
}

export default async function PlatformAdminRestaurantPage({ params }: { params: { id: string } }) {
  const detail = await getRestaurantDetail(params.id);
  if (!detail) notFound();
  return <RestaurantDetail restaurant={detail} />;
}
