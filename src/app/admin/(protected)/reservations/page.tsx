import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { combineDateAndTime, toLocalDateStr, toLocalTimeStr } from "@/lib/availability";
import ReservationsTable from "@/components/admin/ReservationsTable";

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const restaurant = await getActiveRestaurant();
  const date = searchParams.date;

  const where: Record<string, unknown> = { restaurantId: restaurant.id };
  if (date) {
    where.reservationTime = { gte: combineDateAndTime(date, "00:00"), lte: combineDateAndTime(date, "23:59") };
  } else {
    // default: today onward
    const now = new Date();
    where.reservationTime = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: { table: true },
    orderBy: { reservationTime: "asc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reservations</h1>
      <ReservationsTable
        initialReservations={reservations.map((r) => ({
          id: r.id,
          customerName: r.customerName,
          customerEmail: r.customerEmail,
          customerPhone: r.customerPhone,
          partySize: r.partySize,
          date: toLocalDateStr(r.reservationTime),
          time: toLocalTimeStr(r.reservationTime),
          tableName: r.table?.name ?? null,
          status: r.status,
          source: r.source,
          notes: r.notes,
        }))}
        filterDate={date ?? ""}
      />
    </div>
  );
}
