"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type ReservationView = {
  id: string;
  customerName: string;
  partySize: number;
  date: string;
  time: string;
  status: "CONFIRMED" | "ARRIVED" | "CANCELLED" | "NO_SHOW";
  tableNumber: number | null;
  occasion: string | null;
  seatingPreference: string | null;
  accessibilityNeeds: string | null;
  notes: string | null;
};

// Public, token-secured page a guest reaches from their confirmation email
// (see reservationConfirmationHtml in src/lib/email.ts) to view or cancel
// their booking — no login, ownership proven purely by the unguessable `t`
// token matching the reservation's manageToken (checked server-side by
// /api/booking/[id]).
export default function ManageBookingPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This link is missing its access token — please use the link from your confirmation email.");
      setLoading(false);
      return;
    }
    fetch(`/api/booking/${params.id}?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Booking not found");
        setReservation(data.reservation);
        setRestaurantName(data.restaurantName);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id, token]);

  async function cancelBooking() {
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/booking/${params.id}?t=${encodeURIComponent(token)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't cancel this booking.");
      setReservation((r) => (r ? { ...r, status: "CANCELLED" } : r));
      setConfirmingCancel(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {loading && <p className="text-sm text-neutral-500">Loading your booking…</p>}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && reservation && (
          <>
            <h1 className="text-lg font-semibold text-neutral-900">
              {restaurantName ? `Your booking at ${restaurantName}` : "Your booking"}
            </h1>

            {reservation.status === "CANCELLED" ? (
              <p className="mt-3 text-sm text-neutral-500">This booking has been cancelled.</p>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-neutral-500">Name</dt>
                  <dd className="font-medium text-neutral-900">{reservation.customerName}</dd>
                  <dt className="text-neutral-500">Date</dt>
                  <dd className="font-medium text-neutral-900">{reservation.date}</dd>
                  <dt className="text-neutral-500">Time</dt>
                  <dd className="font-medium text-neutral-900">{reservation.time}</dd>
                  <dt className="text-neutral-500">Party size</dt>
                  <dd className="font-medium text-neutral-900">{reservation.partySize}</dd>
                  <dt className="text-neutral-500">Status</dt>
                  <dd className="font-medium text-neutral-900">
                    {reservation.status === "ARRIVED" ? "Arrived" : reservation.status === "NO_SHOW" ? "No show" : "Confirmed"}
                  </dd>
                </dl>

                {reservation.status === "CONFIRMED" && (
                  <div className="mt-5">
                    {!confirmingCancel ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(true)}
                        className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        Cancel this booking
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-700">Cancel your booking for {reservation.partySize} on {reservation.date} at {reservation.time}?</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelBooking}
                            disabled={cancelling}
                            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                          >
                            {cancelling ? "Cancelling…" : "Yes, cancel"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingCancel(false)}
                            disabled={cancelling}
                            className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-semibold text-neutral-700"
                          >
                            Keep booking
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              </>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-neutral-400">
        Powered by{" "}
        <a href="https://hostflow-booking.vercel.app/hostflow" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-500">
          Host Flow
        </a>{" "}
        ·{" "}
        <a href="https://hostflow-booking.vercel.app/hostflow/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-500">
          Privacy
        </a>
      </p>
    </div>
  );
}
