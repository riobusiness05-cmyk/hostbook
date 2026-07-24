import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { toLocalDateStr } from "@/lib/availability";
import ProfileSettings from "@/components/admin/ProfileSettings";
import HoursSettings from "@/components/admin/HoursSettings";
import TablesSettings from "@/components/admin/TablesSettings";
import BlackoutSettings from "@/components/admin/BlackoutSettings";
import FaqSettings from "@/components/admin/FaqSettings";
import MenuSettings from "@/components/admin/MenuSettings";

export default async function AdminSettingsPage() {
  const restaurant = await getActiveRestaurant();

  const [hours, tables, blackouts, faqs, menuItems] = await Promise.all([
    prisma.openingHour.findMany({ where: { restaurantId: restaurant.id }, orderBy: { dayOfWeek: "asc" } }),
    prisma.diningTable.findMany({ where: { restaurantId: restaurant.id }, orderBy: { name: "asc" } }),
    prisma.blackoutDate.findMany({ where: { restaurantId: restaurant.id }, orderBy: { date: "asc" } }),
    prisma.faqEntry.findMany({ where: { restaurantId: restaurant.id }, orderBy: { sortOrder: "asc" } }),
    prisma.menuItem.findMany({ where: { restaurantId: restaurant.id }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="space-y-6 pb-12">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <ProfileSettings
        initial={{
          name: restaurant.name,
          tagline: restaurant.tagline,
          address: restaurant.address,
          phone: restaurant.phone,
          email: restaurant.email,
          brandColor: restaurant.brandColor,
          welcomeMessage: restaurant.welcomeMessage,
          maxPartySize: restaurant.maxPartySize,
          defaultReservationMinutes: restaurant.defaultReservationMinutes,
        }}
      />

      <HoursSettings initial={hours} />

      <TablesSettings initial={tables} />

      <BlackoutSettings
        initial={blackouts.map((b) => ({
          id: b.id,
          date: toLocalDateStr(b.date),
          fullDay: b.fullDay,
          startTime: b.startTime,
          endTime: b.endTime,
          reason: b.reason,
        }))}
      />

      <FaqSettings initial={faqs} />

      <MenuSettings initial={menuItems} />
    </div>
  );
}
