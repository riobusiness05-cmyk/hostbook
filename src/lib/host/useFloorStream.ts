"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FloorState } from "@/lib/hostflow/floor";
import { fetchFloor } from "./client";

type Status = "connecting" | "live" | "polling";

// Subscribes to the /api/host/stream SSE channel and refetches the full floor
// state whenever the server signals a change (or on the 20s heartbeat, so
// time-derived fields stay current). Falls back to interval polling if the
// EventSource errors out. Returns the freshest floor state plus a manual
// refresh() the UI calls right after a mutation for an instant update.
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
    let closed = false;

    const startPolling = () => {
      if (pollTimer) return;
      setStatus("polling");
      pollTimer = setInterval(refresh, 8000);
    };

    try {
      es = new EventSource("/api/host/stream");
      es.addEventListener("ready", () => setStatus("live"));
      es.addEventListener("change", () => refresh());
      es.addEventListener("tick", () => refresh());
      es.onerror = () => {
        if (closed) return;
        setStatus("polling");
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [refresh]);

  return { state, status, error, refresh, setPaused };
}
