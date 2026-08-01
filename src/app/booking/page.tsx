import { getActiveRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/prisma";
import ChatWidget from "@/components/ChatWidget";
import HeroScrub from "@/components/HeroScrub";
import StorySection from "@/components/StorySection";
import LiveEntertainmentSection from "@/components/LiveEntertainmentSection";
import MenuSection, { type MenuGroup } from "@/components/MenuSection";
import ReservationForm from "@/components/ReservationForm";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Menu items are stored with category "Section|Category" (e.g.
 * "Kitchen|Starters") — split them into ordered per-section groups.
 */
function groupMenu(
  items: { id: string; name: string; description: string | null; price: number | null; category: string }[]
) {
  const sections: Record<string, MenuGroup[]> = {};
  for (const item of items) {
    const [section, category] = item.category.includes("|")
      ? item.category.split("|", 2)
      : ["Kitchen", item.category];
    const groups = (sections[section] ??= []);
    let group = groups.find((g) => g.category === category);
    if (!group) {
      group = { category, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return sections;
}

export default async function HomePage() {
  const restaurant = await getActiveRestaurant();
  const [hours, menuItems] = await Promise.all([
    prisma.openingHour.findMany({ where: { restaurantId: restaurant.id }, orderBy: { dayOfWeek: "asc" } }),
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isAvailable: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const sections = groupMenu(menuItems);
  const mapQuery = encodeURIComponent(restaurant.address ?? "Costa Adeje, Tenerife");

  return (
    <main className="bg-colonial-black">
      <div className="film-grain" />

      <HeroScrub src="/videos/hero.mp4" name={restaurant.name} tagline={restaurant.tagline ?? ""} />

      <StorySection src="/images/story.jpg" />

      <LiveEntertainmentSection src="/videos/room.mp4" />

      <section id="reserve" className="relative bg-colonial-black px-6 py-24 md:py-32">
        <div className="mx-auto grid max-w-5xl gap-16 md:grid-cols-[1fr_1.1fr] md:gap-12">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.45em] text-colonial-ember-400">Visit</p>
            <h2 className="mt-4 font-serif text-4xl font-light text-colonial-cream md:text-5xl">
              Hours &amp; Location
            </h2>

            <ul className="mt-10 space-y-2 border-t border-colonial-cream/10 pt-6">
              {hours.map((h) => (
                <li
                  key={h.id}
                  className="flex justify-between border-b border-colonial-cream/10 py-2 font-sans text-sm text-colonial-fade"
                >
                  <span className="uppercase tracking-widest">{DAY_NAMES[h.dayOfWeek]}</span>
                  <span className="text-colonial-cream/80">
                    {h.isClosed ? "Closed" : `${h.openTime} – ${h.closeTime}`}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 space-y-1 font-sans text-sm text-colonial-fade">
              <p>{restaurant.address}</p>
              {restaurant.phone && <p>{restaurant.phone}</p>}
            </div>

            <div className="mt-8 h-64 overflow-hidden rounded-sm border border-colonial-cream/15 grayscale invert-[0.92] contrast-[1.05]">
              <iframe
                title="Map to The Colonial"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
              />
            </div>
          </div>

          <ReservationForm maxPartySize={restaurant.maxPartySize} timezone={restaurant.timezone} />
        </div>
      </section>

      <MenuSection kitchen={sections["Kitchen"] ?? []} bar={sections["Bar"] ?? []} />

      <footer className="border-t border-colonial-cream/10 bg-colonial-black px-6 py-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt={restaurant.name} className="mx-auto mb-4 w-28 opacity-90" />
        <p className="font-sans text-[11px] uppercase tracking-[0.3em] text-colonial-fade/50">
          {restaurant.tagline}
        </p>
      </footer>

      <ChatWidget
        restaurantName={restaurant.name}
        welcomeMessage={restaurant.welcomeMessage}
        brandColor={restaurant.brandColor}
      />
    </main>
  );
}
