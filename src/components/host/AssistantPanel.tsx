"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import { cx } from "@/lib/host/format";
import * as api from "@/lib/host/client";

type Msg = { role: "user" | "assistant"; text: string; source?: string };

const SUGGESTIONS = [
  "What tables are free?",
  "Who's arriving next?",
  "Can we fit a walk-in of 6?",
  "Who's waiting to move outside?",
  "When's the rush?",
  "Seat the next walk-in",
];

export function AssistantPanel({ refresh }: { refresh: () => Promise<void> }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "I'm your AI host assistant. Ask me anything about the live floor — or tell me to seat, move, merge or cancel.", source: "engine" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.askAssistant(q);
      setMessages((m) => [...m, { role: "assistant", text: res.reply, source: res.source }]);
      // If the assistant performed a floor mutation, refresh the live state.
      if (res.action) await refresh();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-full flex-col p-4">
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-500 text-[11px]">✦</span>
          AI Host Assistant
        </span>
      </SectionTitle>

      <div ref={scroller} className="-mx-1 flex-1 space-y-2.5 overflow-y-auto px-1 py-1">
        {messages.map((msg, i) => (
          <div key={i} className={cx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-black/[0.04] text-neutral-800 dark:bg-white/10 dark:text-neutral-100"
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {busy && <div className="px-1 text-xs text-neutral-400">Thinking…</div>}
      </div>

      {messages.length <= 2 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-neutral-600 hover:border-sky-500 hover:text-sky-600 dark:border-white/15 dark:text-neutral-300"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the floor…"
          className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
        />
        <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
          Ask
        </Button>
      </form>
    </Card>
  );
}
