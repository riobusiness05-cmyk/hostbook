"use client";

import { useEffect, useState } from "react";
import { Card, Chip, Button, Gauge, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { BillingState, PlanDTO } from "@/lib/billing/subscription";
import type { InvoiceSummary, PaymentMethodSummary } from "@/lib/stripe";

const STATUS_META: Record<string, { label: string; color: string }> = {
  COMPLIMENTARY: { label: "Complimentary", color: "#a855f7" },
  TRIAL: { label: "Free trial", color: "#3b82f6" },
  ACTIVE: { label: "Active", color: "#22c55e" },
  PAST_DUE: { label: "Payment issue", color: "#f97316" },
  CANCELLED: { label: "Cancelled", color: "#6b7280" },
  EXPIRED: { label: "Trial expired", color: "#ef4444" },
};

// Locale pinned (not `undefined`) so server-rendered and client-hydrated
// output always match — see the identical note in AdminDashboard.tsx.
function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function BillingSection({
  initialBilling,
  initialPlans,
  trialDays,
  blocked = false,
  checkoutResult = null,
}: {
  initialBilling: BillingState;
  initialPlans: PlanDTO[];
  trialDays: number;
  blocked?: boolean;
  checkoutResult?: "success" | "cancelled" | null;
}) {
  const [billing, setBilling] = useState(initialBilling);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodSummary | null>(null);
  const [plans] = useState<PlanDTO[]>(initialPlans);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const summary = await api.fetchBillingSummary();
      setBilling(summary.billing);
      setInvoices(summary.invoices);
      setPaymentMethod(summary.paymentMethod);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    refresh();
    // Webhook processing can lag a second or two behind the Checkout
    // redirect — poll briefly so the status updates without a manual reload.
    if (checkoutResult === "success") {
      const id = setInterval(refresh, 2500);
      const timeout = setTimeout(() => clearInterval(id), 15000);
      return () => {
        clearInterval(id);
        clearTimeout(timeout);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = async (planKey: string) => {
    setBusy("checkout");
    setError(null);
    try {
      const url = await api.createCheckoutSession(planKey, billing.billingInterval);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    setError(null);
    try {
      const url = await api.openBillingPortal();
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of the current billing period, and you can resume anytime before then.")) {
      return;
    }
    setBusy("cancel");
    setError(null);
    try {
      setBilling(await api.cancelSubscription());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    setBusy("resume");
    setError(null);
    try {
      setBilling(await api.resumeSubscription());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const meta = STATUS_META[billing.status] ?? { label: billing.status, color: "#6b7280" };
  const plan = billing.plan ?? plans[0] ?? null;
  const trialGaugeValue =
    billing.trialDaysRemaining != null ? Math.round((billing.trialDaysRemaining / trialDays) * 100) : null;

  return (
    <div className="space-y-4">
          {blocked && (
            <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
              Your dashboard access is paused — {meta.label.toLowerCase()}. Subscribe below to get back in.
            </Card>
          )}
          {checkoutResult === "success" && (
            <Card className="border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              Checkout complete — activating your subscription…
            </Card>
          )}
          {checkoutResult === "cancelled" && (
            <Card className="p-4 text-sm text-neutral-500">Checkout was cancelled — no charge was made.</Card>
          )}
          {billing.cancelAtPeriodEnd && billing.currentPeriodEnd && (
            <Card className="border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-700 dark:text-orange-300">
              Your subscription is set to cancel on {formatDate(billing.currentPeriodEnd)}. Your data is safe and you can resume anytime before then.
            </Card>
          )}
          {error && (
            <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</Card>
          )}

          {/* Plan + status */}
          <Card className="p-5">
            <SectionTitle>Plan & billing status</SectionTitle>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold">{plan?.name ?? "No plan"}</h2>
                  <Chip color={meta.color}>{meta.label}</Chip>
                </div>
                {plan && (
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {formatCents(plan.monthlyPriceCents)}/month
                    {billing.isComplimentary && " · complimentary — never charged"}
                  </p>
                )}
                {billing.complimentaryReason && (
                  <p className="mt-1 text-xs text-neutral-400">{billing.complimentaryReason}</p>
                )}
                {billing.currentPeriodEnd && !billing.cancelAtPeriodEnd && (billing.status === "ACTIVE" || billing.status === "PAST_DUE") && (
                  <p className="mt-1 text-xs text-neutral-400">Next payment {formatDate(billing.currentPeriodEnd)}</p>
                )}
              </div>
              {trialGaugeValue != null && (
                <Gauge value={trialGaugeValue} label={`${billing.trialDaysRemaining}d left`} />
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {billing.canStartCheckout && plan && (
                <Button variant="primary" disabled={busy === "checkout"} onClick={() => startCheckout(plan.key)}>
                  {busy === "checkout" ? "Redirecting…" : billing.storedStatus === "TRIAL" || billing.trialStartedAt ? "Upgrade now" : "Start Free Trial"}
                </Button>
              )}
              {billing.canManageBilling && (
                <Button disabled={busy === "portal"} onClick={openPortal}>
                  {busy === "portal" ? "Redirecting…" : "Manage billing"}
                </Button>
              )}
              {billing.canResume && (
                <Button variant="primary" disabled={busy === "resume"} onClick={resume}>
                  {busy === "resume" ? "Resuming…" : "Resume subscription"}
                </Button>
              )}
              {billing.canCancel && (
                <Button variant="danger" disabled={busy === "cancel"} onClick={cancel}>
                  {busy === "cancel" ? "Cancelling…" : "Cancel subscription"}
                </Button>
              )}
              {!billing.stripeConfigured && (
                <p className="self-center text-xs text-neutral-400">
                  Billing isn&apos;t configured yet — add Stripe keys to .env to enable checkout.
                </p>
              )}
            </div>
          </Card>

          {/* Plan features */}
          {plan && plan.features.length > 0 && (
            <Card className="p-5">
              <SectionTitle>What&apos;s included</SectionTitle>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                    <span className="text-emerald-500">✓</span> {f}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Payment method */}
          {billing.canManageBilling && (
            <Card className="p-5">
              <SectionTitle>Payment method</SectionTitle>
              {paymentMethod ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-neutral-700 dark:text-neutral-200">
                    <span className="font-medium capitalize">{paymentMethod.brand}</span> ending in {paymentMethod.last4}
                    <span className="text-neutral-400"> · expires {String(paymentMethod.expMonth).padStart(2, "0")}/{paymentMethod.expYear}</span>
                  </p>
                  <Button disabled={busy === "portal"} onClick={openPortal}>
                    {busy === "portal" ? "Redirecting…" : "Update card"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-neutral-400">No card on file yet.</p>
              )}
            </Card>
          )}

          {/* Invoices */}
          <Card className="p-5">
            <SectionTitle>Invoice history</SectionTitle>
            {invoices.length === 0 ? (
              <p className="text-sm text-neutral-400">
                {billing.stripeCustomerId ? "No invoices yet." : "Invoices will appear here once you subscribe."}
              </p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/10">
                    <div>
                      <p className="font-medium">{formatCents(inv.amountPaidCents)}</p>
                      <p className="text-xs text-neutral-500">{formatDate(inv.createdAt)} · {inv.status}</p>
                    </div>
                    {inv.hostedInvoiceUrl && (
                      <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">
                        View invoice
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
    </div>
  );
}
