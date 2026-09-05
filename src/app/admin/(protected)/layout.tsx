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
    <div className="dark min-h-screen bg-neutral-950 text-neutral-100">
      <div className="flex">
        <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-white/10 bg-white/[0.02] p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Host Flow AI</p>
          <p className="mb-6 text-sm font-semibold text-white">{restaurant.name}</p>
          <nav className="flex flex-col gap-1 text-sm text-neutral-300">
            <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/5">
              Overview
            </Link>
            <Link href="/admin/reservations" className="rounded-lg px-3 py-2 hover:bg-white/5">
              Reservations
            </Link>
            <Link href="/admin/settings" className="rounded-lg px-3 py-2 hover:bg-white/5">
              Settings
            </Link>
            <Link href="/" className="rounded-lg px-3 py-2 hover:bg-white/5" target="_blank">
              View live site ↗
            </Link>
            <Link href="/hostflow/admin" className="rounded-lg px-3 py-2 hover:bg-white/5">
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
