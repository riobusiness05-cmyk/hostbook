import { NextRequest } from "next/server";
import { getRequestHostSession } from "@/lib/hostAuth";
import { subscribeFloor, FloorChangeEvent } from "@/lib/hostflow/events";

export const dynamic = "force-dynamic";
// Long-lived connection — must not be statically/edge-cached or buffered.
export const runtime = "nodejs";

// Server-Sent Events stream. Every connected host gets a `change` event
// whenever the floor mutates (via the in-process event bus), plus a periodic
// `tick` so time-derived fields (minutes seated, wait times, rush) stay fresh
// even with no explicit mutation, and to keep the connection alive.
export async function GET(req: NextRequest) {
  const session = getRequestHostSession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const restaurantId = session.restaurantId;

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller closed */
        }
      };

      send("ready", { restaurantId, at: Date.now() });

      unsubscribe = subscribeFloor(restaurantId, (evt: FloorChangeEvent) => {
        send("change", evt);
      });

      // Heartbeat / time-refresh every 20s.
      interval = setInterval(() => send("tick", { at: Date.now() }), 20000);

      req.signal.addEventListener("abort", () => {
        unsubscribe();
        if (interval) clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe();
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
