// In-process event bus powering realtime. Every mutation calls
// `emitFloorChange(restaurantId)`; the SSE endpoint (/api/host/stream)
// subscribes and pushes a lightweight "changed" tick to connected hosts,
// who then refetch the floor state.
//
// This is the single seam that would be swapped for Supabase Realtime /
// Postgres LISTEN-NOTIFY in a multi-instance deployment — the rest of the
// app only depends on subscribe()/emit(), not on the transport.

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
