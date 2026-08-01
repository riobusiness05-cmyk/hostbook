"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FloorState } from "@/lib/hostflow/floor";
import { fetchFloor } from "./client";

type Status = "connecting" | "live" | "polling";

// How often the server's heartbeat "tick" (and the polling fallback below)
// forces a refetch — the bound on worst-case staleness when a mutation's
// realtime "change" event doesn't reach this client. That can happen
// because the event bus behind /api/host/stream is in-process (see
// src/lib/hostflow/events.ts), so a write handled by a different serverless
// instance than the one holding this SSE connection open never reaches it.
// Kept short specifically to keep that gap small without needing a
// cross-instance pub/sub swap.
const POLL_INTERVAL_MS = 6000;
// A platform-managed SSE connection is often cut once its underlying
// function's execution window expires — not because anything is actually
// wrong. Rather than staying on the slower polling path for the rest of the
// session after one blip, periodically try to re-establish it.
const SSE_RECONNECT_DELAY_MS = 30000;

// Subscribes to the /api/host/stream SSE channel and refetches the full floor
// state whenever the server signals a change (or on the heartbeat, so
// time-derived fields stay current). Falls back to interval polling if the
// EventSource errors out, and keeps quietly retrying the real connection in
// the background. Returns the freshest floor state plus a manual refresh()
// the UI calls right after a mutation for an instant update.
export function useFloorStream(initial: FloorState) {
  const [state, setState] = useState<FloorState>(initial);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // While a host is mid-way through composing something (e.g. the New
  // Reservation form), background refreshes are paused so live floor updates
  // don't remount the form and wipe their input. A manual refresh({ force })
  // after they submit still goes through.
  const paused = useRef(false);
  const setPaused = useCallback((v: boolean) => {
    paused.current = v;
  }, []);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (inFlight.current) return;
    if (paused.current && !opts?.force) return;
    inFlight.current = true;
    try {
      const next = await fetchFloor();
      setState(next);
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const startPolling = () => {
      if (!pollTimer) pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          es?.close();
          es = null;
          connectSSE();
        }, SSE_RECONNECT_DELAY_MS);
      }
    };

    const connectSSE = () => {
      if (destroyed) return;
      try {
        const conn = new EventSource("/api/host/stream");
        conn.addEventListener("ready", () => {
          if (destroyed) return;
          stopPolling();
          clearReconnect();
          setStatus("live");
        });
        conn.addEventListener("change", () => refresh());
        conn.addEventListener("tick", () => refresh());
        conn.onerror = () => {
          if (destroyed) return;
          conn.close();
          if (es === conn) es = null;
          setStatus("polling");
          startPolling();
        };
        es = conn;
      } catch {
        setStatus("polling");
        startPolling();
      }
    };

    connectSSE();

    // Catch up immediately when the tab regains focus instead of waiting for
    // the next tick/poll — the most common real way staleness actually gets
    // noticed (someone switches back to the floor after being away).
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      destroyed = true;
      es?.close();
      stopPolling();
      clearReconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return { state, status, error, refresh, setPaused };
}
