import { redirect } from "next/navigation";

// This deployment hosts both the Host Flow SaaS product and (at /booking)
// the legacy single-tenant guest booking template for whichever restaurant
// NEXT_PUBLIC_RESTAURANT_SLUG points to. The bare domain should lead with
// Host Flow, not one tenant's public site.
export default function RootPage() {
  redirect("/hostflow");
}
