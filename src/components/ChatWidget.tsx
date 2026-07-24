"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function ChatWidget({
  restaurantName,
  welcomeMessage,
  brandColor,
}: {
  restaurantName: string;
  welcomeMessage: string;
  brandColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: welcomeMessage }]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, channel: "WEB" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-3 flex h-[520px] w-[360px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ backgroundColor: brandColor }}
          >
            <div>
              <p className="text-sm font-semibold leading-tight">{restaurantName}</p>
              <p className="text-xs opacity-90 leading-tight">Gary the Monkey · usually replies instantly</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-full p-1 text-white/90 hover:bg-white/20"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user" ? "text-white" : "bg-neutral-100 text-neutral-900"
                  }`}
                  style={m.role === "user" ? { backgroundColor: brandColor } : undefined}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-500">Typing…</div>
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-black/10 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a table, hours, menu…"
              className="flex-1 rounded-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: brandColor }}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-xl transition-transform hover:scale-105"
        style={{ backgroundColor: brandColor }}
      >
        {open ? "Close" : "🐒 Talk to Gary the Monkey"}
      </button>
    </div>
  );
}
