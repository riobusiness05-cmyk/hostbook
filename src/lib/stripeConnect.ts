import { prisma } from "@/lib/prisma";
import { getClient, appUrl } from "@/lib/stripe";
import type { Restaurant, Reservation } from "@prisma/client";

/**
 * Stripe Connect — a restaurant's OWN Stripe account, used only for no-show
 * protection (guest saves a card, restaurant charges a fee if they don't
 * show up). Deliberately separate from src/lib/stripe.ts, which is the
 * platform's own Stripe account for SaaS billing (restaurant -> Host Flow).
 * Money here flows guest -> restaurant; Host Flow never touches it.
 *
 * Every call below reuses the platform's Stripe secret key via getClient()
 * but passes `{ stripeAccount: acctId }` as request options, which is how
 * the Stripe SDK scopes a single API call to act "as" the connected account
 * (the standard "direct charges" Connect pattern) — no separate client or
 * connected-account credentials needed.
 */

// ── Onboarding ───────────────────────────────────────────────────────────

/**
 * Creates a Stripe Express account for this restaurant if it doesn't have
 * one yet, then returns a fresh onboarding link URL. Safe to call repeatedly
 * — an existing account is reused, and Stripe account links are always
 * single-use/short-lived so a fresh one is generated on every call.
 */
export async function createOrGetConnectOnboardingLink(restaurant: Pick<Restaurant, "id" | "stripeConnectAccountId" | "email" | "name">): Promise<string> {
  const stripe = getClient();

  let accountId = restaurant.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: restaurant.email ?? undefined,
      business_profile: { name: restaurant.name },
    });
    accountId = account.id;
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { stripeConnectAccountId: accountId } });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${appUrl()}/host/settings?stripe_connect=refresh`,
    return_url: `${appUrl()}/host/settings?stripe_connect=return`,
  });
  return link.url;
}

export type ConnectAccountStatus = { connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };

/**
 * Live status, not cached — the settings page calls this on load and right
 * after the onboarding redirect returns, which is simpler and more honest
 * than trying to keep a local "connected" flag in sync via a webhook.
 */
export async function getConnectAccountStatus(accountId: string | null): Promise<ConnectAccountStatus> {
  if (!accountId) return { connected: false, chargesEnabled: false, detailsSubmitted: false };
  const stripe = getClient();
  const account = await stripe.accounts.retrieve(accountId);
  const chargesEnabled = !!account.charges_enabled;
  // Best-effort: record the first time we see chargesEnabled so other parts
  // of the app (e.g. "connected since") have it without another API call.
  // Never blocks the status response on this write.
  if (chargesEnabled) {
    prisma.restaurant
      .updateMany({ where: { stripeConnectAccountId: accountId, stripeConnectOnboardedAt: null }, data: { stripeConnectOnboardedAt: new Date() } })
      .catch(() => {});
  }
  return { connected: true, chargesEnabled, detailsSubmitted: !!account.details_submitted };
}

// ── Guest card collection ───────────────────────────────────────────────

/**
 * Starts a card-save (no charge) for a guest booking online. `usage:
 * "off_session"` is what makes the resulting PaymentMethod chargeable later
 * without the guest present — required for the no-show-fee use case.
 */
export async function createGuestCardSetupIntent(restaurant: Pick<Restaurant, "stripeConnectAccountId">): Promise<{ clientSecret: string }> {
  if (!restaurant.stripeConnectAccountId) {
    throw new Error("This restaurant hasn't connected Stripe yet — no-show protection isn't available.");
  }
  const stripe = getClient();
  const intent = await stripe.setupIntents.create(
    { usage: "off_session", payment_method_types: ["card"] },
    { stripeAccount: restaurant.stripeConnectAccountId }
  );
  if (!intent.client_secret) throw new Error("Stripe didn't return a client secret for the card setup.");
  return { clientSecret: intent.client_secret };
}

/** Re-verifies server-side that a SetupIntent actually succeeded and belongs
 *  to this restaurant's account before trusting it — never take the
 *  client's word for it. Returns the saved payment method id. */
export async function verifyGuestCardSetup(
  restaurant: Pick<Restaurant, "stripeConnectAccountId">,
  setupIntentId: string
): Promise<{ paymentMethodId: string }> {
  if (!restaurant.stripeConnectAccountId) {
    throw new Error("This restaurant hasn't connected Stripe yet — no-show protection isn't available.");
  }
  const stripe = getClient();
  const intent = await stripe.setupIntents.retrieve(setupIntentId, undefined, { stripeAccount: restaurant.stripeConnectAccountId });
  if (intent.status !== "succeeded") {
    throw new Error("Card verification didn't complete — please try adding your card again.");
  }
  const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (!paymentMethodId) {
    throw new Error("No card was saved on that verification — please try again.");
  }
  return { paymentMethodId };
}

// ── No-show charge ───────────────────────────────────────────────────────

export type NoShowChargeResult =
  | { outcome: "charged"; chargeId: string }
  | { outcome: "failed"; reason: string };

/**
 * Charges the guest's saved card for the no-show fee. Never throws — always
 * returns a result so the caller (updateReservationStatus) can persist the
 * outcome without the no-show status change itself ever failing because of
 * a payment problem. `off_session: true` can be declined by EU-issued cards
 * requiring 3D-Secure (SCA) with the guest not present to complete it —
 * that surfaces here as a "failed" outcome with a clear reason, not a bug.
 */
export async function chargeNoShowFee(
  restaurant: Pick<Restaurant, "stripeConnectAccountId">,
  reservation: Pick<Reservation, "stripePaymentMethodId" | "customerName">,
  feeCents: number,
  currency: string
): Promise<NoShowChargeResult> {
  if (!restaurant.stripeConnectAccountId || !reservation.stripePaymentMethodId) {
    return { outcome: "failed", reason: "No card on file for this reservation." };
  }
  try {
    const stripe = getClient();
    const intent = await stripe.paymentIntents.create(
      {
        amount: feeCents,
        currency,
        payment_method: reservation.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        description: `No-show fee — ${reservation.customerName}`,
      },
      { stripeAccount: restaurant.stripeConnectAccountId }
    );
    if (intent.status === "succeeded") return { outcome: "charged", chargeId: intent.id };
    return { outcome: "failed", reason: `Card declined (${intent.status}) — the guest may need to verify the card themselves.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripeConnect] no-show charge failed", err);
    return { outcome: "failed", reason: message };
  }
}
