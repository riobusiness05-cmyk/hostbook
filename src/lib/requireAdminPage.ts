import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

/**
 * Server-side gate for platform-admin PAGES. Must be the first statement of
 * every admin page.tsx (and generateMetadata), before any data is read.
 *
 * A guard in layout.tsx alone is not enough: Next renders the page segment
 * in parallel with its layout, so the page's Prisma reads have already run
 * and been serialised into the RSC payload by the time the layout redirects.
 * An anonymous `RSC: 1` request then receives the whole dashboard.
 */
export function requireAdminPage(): void {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifySessionToken(token)) redirect("/admin/login");
}
