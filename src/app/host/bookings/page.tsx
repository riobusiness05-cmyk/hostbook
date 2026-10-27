import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerHostSession } from "@/lib/hostAuth";
import { getBillingState } from "@/lib/billing/subscription";
import { getDayPlan } from "@/lib/hostflow/dayplan";
import { localDateStr } from "@/lib/host/format";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

// The plain list: what's booked on a day, in time order, with everything
// staff need at the stand — time, name, party, table, phone, whether the
// guest confirmed. Big type for an iPad propped at the door, and it prints.
// No floor plan, no charts. Refreshes itself every minute.

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(dateStr: string, timeZone: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone });
}

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Booked", ARRIVED: "Arrived", SEATED: "Seated", COMPLETED: "Done", CANCELLED: "Cancelled", NO_SHOW: "No-show", PENDING: "Pending",
};

export default async function BookingsListPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getServerHostSession();
  if (!session) redirect("/hostflow/login");
  const restaurant = await prisma.restaurant.findUnique({ where: { id: session.restaurantId } });
  if (!restaurant) redirect("/hostflow/login");
  const billing = await getBillingState(restaurant.id);
  if (!billing.hasAccess) redirect("/host/settings?blocked=1");

  const today = localDateStr(new Date().toISOString(), restaurant.timezone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : today;
  const plan = await getDayPlan(restaurant.id, date);
  const live = plan.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "NO_SHOW");
  const confirmed = live.filter((b) => b.guestConfirmedAt).length;
  const reminded = live.filter((b) => b.reminderSentAt && !b.guestConfirmedAt).length;
  const noContact = live.filter((b) => !b.customerPhone && !b.customerEmail).length;

  const nav = (d: string, label: string, current: boolean) => (
    <Link
      href={`/host/bookings?date=${d}`}
      className={
        "rounded-lg px-3 py-1.5 text-sm font-semibold " +
        (current ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 print:bg-white print:text-black">
      <AutoRefresh seconds={60} />
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-950/90 print:static">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{restaurant.name} · bookings</h1>
            <p className="text-sm text-neutral-500">{prettyDate(date, restaurant.timezone)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {nav(shiftDate(date, -1), "‹", false)}
            {nav(today, "Today", date === today)}
            {nav(shiftDate(today, 1), "Tomorrow", date === shiftDate(today, 1))}
            {nav(shiftDate(date, 1), "›", false)}
            <Link href="/host" className="ml-2 rounded-lg border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">Floor</Link>
          </div>
        </div>
        <div className="mx-auto mt-3 grid max-w-4xl grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Bookings", String(live.length)],
            ["Covers", String(plan.metrics.covers)],
            ["Confirmed coming", String(confirmed)],
            ["No reply yet", String(reminded)],
            ["No contact", String(noContact)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-black/5 px-3 py-2 dark:border-white/10">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4">
        {plan.bookings.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">Nothing booked for this day.</p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {plan.bookings.map((b) => {
              const dead = b.status === "CANCELLED" || b.status === "NO_SHOW";
              return (
                <li key={b.id} className={"flex flex-wrap items-center gap-x-4 gap-y-1 py-3 " + (dead ? "opacity-40" : "")}>
                  <span className="w-16 shrink-0 text-2xl font-bold tabular-nums">{b.time}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">
                      {b.customerName}
                      {b.isVip && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">VIP</span>}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {b.tableNumber ? `Table ${b.tableNumber}${b.comboTableNumbers.length ? ` + ${b.comboTableNumbers.join(", ")}` : ""}` : "No table yet"}
                      {b.sectionName ? ` · ${b.sectionName}` : b.seatingPreference ? ` · ${b.seatingPreference}` : ""}
                      {b.occasion ? ` · ${b.occasion}` : ""}
                      {b.notes ? ` · ${b.notes}` : ""}
                    </p>
                  </div>
                  <span className="w-20 shrink-0 text-center text-lg font-semibold tabular-nums">{b.partySize} <span className="text-sm font-normal text-neutral-500">pax</span></span>
                  <div className="w-44 shrink-0 text-sm">
                    {b.customerPhone ? (
                      <a href={`tel:${b.customerPhone.replace(/[^+\d]/g, "")}`} className="font-medium underline decoration-dotted underline-offset-2">📞 {b.customerPhone}</a>
                    ) : (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">No phone</span>
                    )}
                    {b.customerEmail && <p className="truncate text-xs text-neutral-500" title={b.customerEmail}>{b.customerEmail}</p>}
                  </div>
                  <div className="w-36 shrink-0 text-right text-sm">
                    {dead ? (
                      <span className="text-neutral-500">{STATUS_LABEL[b.status]}</span>
                    ) : b.guestConfirmedAt ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">✓ Confirmed coming</span>
                    ) : b.reminderSentAt ? (
                      <span className="rounded bg-neutral-500/15 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">Reminded · no reply</span>
                    ) : (
                      <span className="text-neutral-500">{STATUS_LABEL[b.status] ?? b.status}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
