import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { combineDateAndTime, toLocalTimeStr } from "@/lib/availability";
import Link from "next/link";

function todayStr() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

export default async function AdminOverviewPage() {
  const restaurant = await getActiveRestaurant();
  const today = todayStr();
  const dayStart = combineDateAndTime(today, "00:00");
  const dayEnd = combineDateAndTime(today, "23:59");

  const weekEnd = new Date(dayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [todaysReservations, upcomingCount, chatSessionCount] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        reservationTime: { gte: dayStart, lte: dayEnd },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: { table: true },
      orderBy: { reservationTime: "asc" },
    }),
    prisma.reservation.count({
      where: {
        restaurantId: restaurant.id,
        reservationTime: { gte: dayStart, lte: weekEnd },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
    prisma.chatSession.count({
      where: { restaurantId: restaurant.id, createdAt: { gte: dayStart } },
    }),
  ]);

  const guestsToday = todaysReservations.reduce((sum, r) => sum + r.partySize, 0);
  const chatBookings = todaysReservations.filter((r) => r.source === "WEB_CHAT").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Reservations today" value={todaysReservations.length} />
        <StatCard label="Guests today" value={guestsToday} />
        <StatCard label="Booked via AI chat today" value={chatBookings} />
        <StatCard label="Next 7 days" value={upcomingCount} />
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Today&apos;s reservations</h2>
          <Link href="/admin/reservations" className="text-sm text-neutral-500 hover:underline">
            View all →
          </Link>
        </div>
        {todaysReservations.length === 0 ? (
          <p className="text-sm text-neutral-500">No reservations booked for today yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-neutral-500">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Party</th>
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {todaysReservations.map((r) => (
                <tr key={r.id} className="border-b border-black/5">
                  <td className="py-2 pr-3">{toLocalTimeStr(r.reservationTime)}</td>
                  <td className="py-2 pr-3">{r.customerName}</td>
                  <td className="py-2 pr-3">{r.partySize}</td>
                  <td className="py-2 pr-3">{r.table?.name ?? "—"}</td>
                  <td className="py-2 pr-3 text-neutral-500">{r.source.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {chatSessionCount === 0 && (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white p-5 text-sm text-neutral-500">
          No chat conversations yet today. Once ANTHROPIC_API_KEY is set and the widget is live on your site, the
          AI host will start handling bookings and questions here automatically.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-2xl font-semibold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
