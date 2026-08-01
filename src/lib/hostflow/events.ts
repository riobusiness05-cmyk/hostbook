// In-process event bus powering realtime. Every mutation calls
// `emitFloorChange(restaurantId)`; the SSE endpoint (/api/host/stream)
// subscribes and pushes a lightweight "changed" tick to connected hosts,
// who then refetch the floor state.
//
// Known limitation: on a multi-instance deployment (e.g. Vercel serverless),
// a mutation handled by one instance only reaches SSE connections held open
// by that SAME instance — a second connected device attached to a different
// instance won't see the `change` event. useFloorStream.ts's short
// heartbeat-driven refetch (see POLL_INTERVAL_MS there) bounds how stale
// that can get to a few seconds, but it isn't truly instant for every
// connected client. A real fix needs an external pub/sub channel built for
// this (e.g. Supabase Realtime, Pusher, Ably) — Postgres LISTEN/NOTIFY alone
// doesn't solve it, since a serverless function can't hold a LISTEN
// connection open indefinitely either. Swapping the transport only means
// changing subscribe()/emit() below and the SSE route; nothing else in the
// app depends on how this bus is implemented.

import { EventEmitter } from "events";

// Survive Next.js dev hot-reload (module re-evaluation) via a global singleton.
const globalForBus = globalThis as unknown as { __hostflowBus?: EventEmitter };

const bus =
  globalForBus.__hostflowBus ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0); // one listener per open SSE connection; don't warn
    return e;
  })();

if (process.env.NODE_ENV !== "production") globalForBus.__hostflowBus = bus;

export type FloorChangeReason =
  | "table"
  | "reservation"
  | "walkin"
  | "notification"
  | "settings"
  | "tick";

export type FloorChangeEvent = {
  restaurantId: string;
  reason: FloorChangeReason;
  at: number;
};

function channel(restaurantId: string) {
  return `floor:${restaurantId}`;
}

export function emitFloorChange(restaurantId: string, reason: FloorChangeReason = "table") {
  const evt: FloorChangeEvent = { restaurantId, reason, at: Date.now() };
  bus.emit(channel(restaurantId), evt);
}

export function subscribeFloor(
  restaurantId: string,
  handler: (evt: FloorChangeEvent) => void
): () => void {
  const ch = channel(restaurantId);
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}
