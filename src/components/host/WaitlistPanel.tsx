"use client";

import { useState } from "react";
import type { FloorState } from "@/lib/hostflow/floor";
import { Button, Card, Chip, SectionTitle } from "./ui";
import { cx, minutesLabel } from "@/lib/host/format";
import * as api from "@/lib/host/client";

const PRIORITY_COLOR: Record<string, string> = {
  VIP: "#a855f7",
  HIGH: "#f97316",
  NORMAL: "#64748b",
};

export function WaitlistPanel({ state, refresh }: { state: FloorState; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seat = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.seatWalkin(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, status: "SEATED" | "LEFT" | "CANCELLED") => {
    setBusyId(id);
    try {
      await api.updateWalkin(id, { status });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const walkinsEnabled = state.settings.walkinsEnabled;

  return (
    <Card className="flex h-full flex-col p-4">
      <SectionTitle
        action={
          walkinsEnabled ? (
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              {adding ? "Close" : "+ Walk-in"}
            </Button>
          ) : undefined
        }
      >
        Waitlist · {state.walkins.length}
      </SectionTitle>

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {!walkinsEnabled && (
        <p className="mb-2 text-xs text-neutral-400">Walk-ins are turned off in Settings.</p>
      )}

      {adding && walkinsEnabled && <AddWalkinForm onDone={() => { setAdding(false); refresh(); }} />}

      <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
        {state.walkins.length === 0 && !adding && (
          <p className="py-6 text-center text-sm text-neutral-400">No one waiting.</p>
        )}
        {state.walkins.map((w, i) => (
          <div
            key={w.id}
            className="rounded-xl border border-black/5 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.02]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                    {i + 1}
                  </span>
                  <span className="truncate font-semibold text-neutral-900 dark:text-white">{w.name}</span>
                  <Chip color={PRIORITY_COLOR[w.priority]}>{w.priority === "NORMAL" ? `${w.partySize}p` : w.priority}</Chip>
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Party {w.partySize} · waiting {minutesLabel(w.minutesWaiting)} · quoted {minutesLabel(w.quotedWaitMinutes)}
                  {w.minutesWaiting > w.quotedWaitMinutes && (
                    <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">over quote</span>
                  )}
                </p>
                {w.accessibilityNeeds && <p className="mt-0.5 text-xs text-sky-600 dark:text-sky-400">♿ {w.accessibilityNeeds}</p>}
                {w.notes && <p className="mt-0.5 text-xs text-neutral-400">{w.notes}</p>}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" className="flex-1" disabled={busyId === w.id} onClick={() => seat(w.id)}>
                Seat best table
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === w.id} onClick={() => remove(w.id, "LEFT")}>
                Left
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AddWalkinForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [priority, setPriority] = useState("NORMAL");
  const [quotedWaitMinutes, setQuoted] = useState(15);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.addWalkin({ name: name.trim(), partySize, priority, quotedWaitMinutes, phone: phone || undefined, notes: notes || undefined });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <input className={inputCls} placeholder="Guest name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">
          Party
          <input type="number" min={1} className={inputCls} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
        </label>
        <label className="text-xs text-neutral-500">
          Quoted wait (min)
          <input type="number" min={0} className={inputCls} value={quotedWaitMinutes} onChange={(e) => setQuoted(Number(e.target.value))} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">
          Priority
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="VIP">VIP</option>
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          Phone (optional)
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <input className={inputCls} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button variant="primary" className="w-full" disabled={busy || !name.trim()} onClick={submit}>
        Add to waitlist
      </Button>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white";
