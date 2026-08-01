import { redirect } from "next/navigation";

// This deployment hosts both the Host Flow SaaS product and (at /booking)
// the legacy single-tenant guest booking template for whichever restaurant
// NEXT_PUBLIC_RESTAURANT_SLUG points to. The bare domain should lead with
// Host Flow, not one tenant's public site.
//
// force-dynamic: a redirect()-only page with no other dynamic data access
// is eligible for static generation, which lets Vercel's edge cache pin the
// response indefinitely — including, apparently, a stale pre-redirect build
// artifact that kept serving The Colonial's homepage at the bare domain
// long after this route was changed to redirect. Forcing this dynamic
// means the redirect actually runs on every request instead of ever being
// served from a cached snapshot.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/hostflow");
}
