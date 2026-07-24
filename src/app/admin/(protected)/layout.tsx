import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { getActiveRestaurant } from "@/lib/restaurant";
import LogoutButton from "@/components/admin/LogoutButton";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifySessionToken(token)) {
    redirect("/admin/login");
  }

  const restaurant = await getActiveRestaurant();

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="flex">
        <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-black/10 bg-white p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Host Flow AI</p>
          <p className="mb-6 text-sm font-semibold text-neutral-900">{restaurant.name}</p>
          <nav className="flex flex-col gap-1 text-sm">
            <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-neutral-100">
              Overview
            </Link>
            <Link href="/admin/reservations" className="rounded-lg px-3 py-2 hover:bg-neutral-100">
              Reservations
            </Link>
            <Link href="/admin/settings" className="rounded-lg px-3 py-2 hover:bg-neutral-100">
              Settings
            </Link>
            <Link href="/" className="rounded-lg px-3 py-2 hover:bg-neutral-100" target="_blank">
              View live site ↗
            </Link>
            <Link href="/hostflow/admin" className="rounded-lg px-3 py-2 hover:bg-neutral-100">
              Host Flow admin ↗
            </Link>
          </nav>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
