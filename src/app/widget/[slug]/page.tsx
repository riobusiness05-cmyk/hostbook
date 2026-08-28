import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
  const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } });
  // Only actually required once the restaurant's own Stripe account is
  // connected — a toggle flipped on before finishing onboarding shouldn't
  // block a guest from booking.
  const noShowProtection =
    settings?.noShowProtectionEnabled && restaurant.stripeConnectAccountId
      ? { feeCents: settings.noShowFeeCents ?? 0, minPartySize: settings.noShowMinPartySize ?? 1 }
      : null;

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <WidgetBookingForm
        slug={restaurant.slug}
        restaurantName={restaurant.name}
        maxPartySize={restaurant.maxPartySize}
        timezone={restaurant.timezone}
        brandColor={restaurant.brandColor}
        noShowProtection={noShowProtection}
      />
    </div>
  );
}
