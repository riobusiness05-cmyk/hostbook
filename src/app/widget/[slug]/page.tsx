import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/restaurant";
import { WidgetBookingForm } from "@/components/WidgetBookingForm";

// The page a Host Flow customer embeds on their own website (see
// public/widget.js) — deliberately minimal (no nav, no menu, no marketing),
// just the booking form itself, since it's meant to sit inside an iframe on
// someone else's site rather than be visited directly. Public, no auth.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const restaurant = await getRestaurantBySlug(params.slug);
  return { title: restaurant ? `Book a table — ${restaurant.name}` : "Book a table" };
}

export default async function WidgetPage({ params }: { params: { slug: string } }) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <WidgetBookingForm
        slug={restaurant.slug}
        restaurantName={restaurant.name}
        maxPartySize={restaurant.maxPartySize}
        timezone={restaurant.timezone}
        brandColor={restaurant.brandColor}
      />
    </div>
  );
}
