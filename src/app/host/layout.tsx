import { redirect } from "next/navigation";
import { getServerHostSession } from "@/lib/hostAuth";

// The host floor app is staff-only and multi-tenant: the session determines
// which bar's floor is shown. Unauthenticated staff are sent to the Host Flow
// sign-in (not the customer site).
export default function HostLayout({ children }: { children: React.ReactNode }) {
  const session = getServerHostSession();
  if (!session) {
    redirect("/hostflow/login");
  }
  return children;
}
