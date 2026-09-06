"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

export type NoShowCardFieldHandle = {
  /** Confirms the card save and returns the SetupIntent id to submit
   *  alongside the reservation. Throws with a guest-readable message on
   *  failure (declined card, needs verification, etc). */
  confirmSetup: () => Promise<string>;
};

/**
 * Guest-facing card collection for no-show protection. Fetches a SetupIntent
 * from `setupIntentUrl` on mount, renders a Stripe card field, and exposes
 * confirmSetup() via ref so the parent booking form can call it right before
 * its own submit — this component never posts the reservation itself, it
 * only proves a card was saved (no charge happens here or ever, unless a
 * staff member later marks that booking a no-show).
 */
export const NoShowCardField = forwardRef<
  NoShowCardFieldHandle,
  { setupIntentUrl: string; dark?: boolean }
>(function NoShowCardField({ setupIntentUrl, dark }, ref) {
  const [stripePromise, setStripePromise] = useState<Promise<StripeJs | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(setupIntentUrl, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.clientSecret || !data.publishableKey || !data.connectedAccountId) {
          setError(data.error || "Couldn't set up card verification.");
          return;
        }
        setClientSecret(data.clientSecret);
        // The SetupIntent lives under the restaurant's own connected Stripe
        // account (Connect direct-charge pattern), not the platform account
        // the publishable key belongs to by default — Stripe.js needs to be
        // told which connected account to look under, or confirmCardSetup
        // fails to find it.
        setStripePromise(loadStripe(data.publishableKey, { stripeAccount: data.connectedAccountId }));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, [setupIntentUrl]);

  const textCls = dark ? "text-colonial-fade" : "text-neutral-500";
  const errorCls = dark ? "text-red-400" : "text-red-600";

  if (error) return <p className={`text-sm ${errorCls}`}>{error}</p>;
  if (!stripePromise || !clientSecret) return <p className={`text-xs ${textCls}`}>Loading card field…</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: dark ? "night" : "stripe" } }}>
      <CardFieldInner ref={ref} clientSecret={clientSecret} dark={dark} />
    </Elements>
  );
});

const CardFieldInner = forwardRef<NoShowCardFieldHandle, { clientSecret: string; dark?: boolean }>(
  function CardFieldInner({ clientSecret, dark }, ref) {
    const stripe = useStripe();
    const elements = useElements();
    const [cardError, setCardError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      confirmSetup: async () => {
        setCardError(null);
        if (!stripe || !elements) throw new Error("Card field isn't ready yet.");
        const card = elements.getElement(CardElement);
        if (!card) throw new Error("Card field isn't ready yet.");
        const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
          payment_method: { card },
        });
        if (error || !setupIntent) {
          const message = error?.message || "That card couldn't be verified.";
          setCardError(message);
          throw new Error(message);
        }
        return setupIntent.id;
      },
    }));

    return (
      <div>
        <div
          className={`rounded-lg border px-3 py-2.5 ${dark ? "border-colonial-cream/20 bg-transparent" : "border-neutral-200 bg-white"}`}
        >
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "14px",
                  color: dark ? "#f5f0e8" : "#171717",
                  "::placeholder": { color: dark ? "#9c9184" : "#a3a3a3" },
                },
                invalid: { color: "#ef4444" },
              },
            }}
          />
        </div>
        {cardError && <p className="mt-1.5 text-xs text-red-500">{cardError}</p>}
      </div>
    );
  }
);
