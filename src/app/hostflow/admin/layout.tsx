import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// The Host Flow platform admin — cross-restaurant billing oversight — is a
// distinct product from the legacy per-restaurant admin at /admin/(protected)
// (that one is scoped to a single deployment's getActiveRestaurant()). Both
// reuse the same env-based operator login (ADMIN_EMAIL/ADMIN_PASSWORD,
// hf_admin_session cookie) since there's only one "Host Flow operator"
// persona, same as the legacy admin was built for — just pointed at a
// different view here.
export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifySessionToken(token)) {
    redirect("/admin/login");
  }
  return children;
}
