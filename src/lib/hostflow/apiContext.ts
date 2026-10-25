import { NextRequest, NextResponse } from "next/server";
import { getRequestHostSession, type HostRole } from "@/lib/hostAuth";
import { getBillingState } from "@/lib/billing/subscription";
import { HostFlowError } from "./actions";

// Shared entry point for every /api/host route: resolve the tenant from the
// restaurant-scoped Host Flow session. Returns either a context object or a
// ready-to-return NextResponse (401/402), so route handlers stay a couple of
// lines long — and every query is automatically scoped to the logged-in bar.
//
// Also enforces billing access here (not just on the initial /host page
// load): the dashboard is a client-rendered SPA that talks to these routes
// directly, so a page-load-only check left every mutation reachable forever
// once a tab was open, regardless of trial/subscription status. Billing's
// own routes (checkout/portal/cancel/resume/status) opt out via
// `requireAccess: false` so a blocked account can still see its status and
// pay — everything else is cut off the moment access lapses.
export type HostCtx = { restaurantId: string; accountId: string; role: HostRole };

// What each role may do. STAFF run the floor; MANAGER also shapes the
// venue (hours, tables, settings, emails); OWNER also controls money and
// who has access.
export const ROLE_RANK: Record<HostRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 };

export async function hostContext(
  req: NextRequest,
  { requireAccess = true, role }: { requireAccess?: boolean; role?: HostRole } = {}
): Promise<HostCtx | { error: NextResponse }> {
  const session = await getRequestHostSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (role && ROLE_RANK[session.role] < ROLE_RANK[role]) {
    return {
      error: NextResponse.json(
        { error: role === "OWNER" ? "Only the owner can do that." : "Only a manager or the owner can do that." },
        { status: 403 }
      ),
    };
  }
  if (requireAccess) {
    const billing = await getBillingState(session.restaurantId);
    if (!billing.hasAccess) {
      return {
        error: NextResponse.json(
          { error: "Your trial or subscription has ended. Visit Settings → Billing to continue." },
          { status: 402 }
        ),
      };
    }
  }
  return { restaurantId: session.restaurantId, accountId: session.accountId, role: session.role };
}

// Uniform error handling for mutation handlers.
export function handleActionError(err: unknown): NextResponse {
  if (err instanceof HostFlowError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[hostflow] action error", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
