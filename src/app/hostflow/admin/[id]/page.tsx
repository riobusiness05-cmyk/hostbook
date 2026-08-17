import { notFound } from "next/navigation";
import { getRestaurantDetail } from "@/lib/platformAdmin";
import { RestaurantDetail } from "@/components/platform-admin/RestaurantDetail";

export const dynamic = "force-dynamic";

export default async function PlatformAdminRestaurantPage({ params }: { params: { id: string } }) {
  const detail = await getRestaurantDetail(params.id);
  if (!detail) notFound();
  return <RestaurantDetail restaurant={detail} />;
}
