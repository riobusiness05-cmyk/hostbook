"use client";

import { useMemo, useState } from "react";
import * as api from "@/lib/host/client";
import type { DetectedTable, FloorPlanAnalysis } from "@/lib/host/client";
import { Button } from "./ui";
import { cx } from "@/lib/host/format";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

const LOW_CONFIDENCE = 0.6;

// AI floor-plan-from-image: upload a photo -> Claude vision detects tables ->
// host reviews/edits (low-confidence tables must be explicitly confirmed,
// never silently trusted) -> apply creates real, immediately-editable
// Section/DiningTable rows via the existing floor-plan editor.
export function FloorPlanImport({ onApplied }: { onApplied: (summary: { tableCount: number }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FloorPlanAnalysis | null>(null);
  const [confirmedLow, setConfirmedLow] = useState<Set<string>>(new Set());
  const [room, setRoom] = useState("Main Room");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lowConfidenceTables = useMemo(
    () => (analysis ? analysis.tables.filter((t) => t.confidence < LOW_CONFIDENCE) : []),
    [analysis]
  );
  const allLowConfirmed = lowConfidenceTables.every((t) => confirmedLow.has(t.tempId));

  const pickFile = (f: File) => {
    setFile(f);
    setAnalysis(null);
    setError(null);
    setImageUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const result = await api.analyzeFloorPlanImage(base64, file.type || "image/jpeg");
      setAnalysis(result);
      setConfirmedLow(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateTable = (tempId: string, patch: Partial<DetectedTable>) => {
    setAnalysis((a) => (a ? { ...a, tables: a.tables.map((t) => (t.tempId === tempId ? { ...t, ...patch } : t)) } : a));
  };
  const updateSectionName = (tempId: string, name: string) => {
    setAnalysis((a) => (a ? { ...a, sections: a.sections.map((s) => (s.tempId === tempId ? { ...s, name } : s)) } : a));
  };

  const apply = async () => {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.applyFloorPlan({ room, sections: analysis.sections, tables: analysis.tables });
      onApplied({ tableCount: result.tableCount });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!analysis && (
        <div className="space-y-3 rounded-xl border border-dashed border-black/15 p-6 text-center dark:border-white/20">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Upload a photo of your floor plan or POS table map — the AI will detect tables, seats, and layout.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
            className="mx-auto block text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white dark:text-neutral-300 dark:file:bg-white dark:file:text-neutral-900"
          />
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Uploaded floor plan" className="mx-auto max-h-64 rounded-lg border border-black/10 dark:border-white/10" />
          )}
          <Button variant="primary" disabled={!file || busy} onClick={analyze}>
            {busy ? "Analyzing…" : "Analyze floor plan"}
          </Button>
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Found {analysis.tables.length} table{analysis.tables.length === 1 ? "" : "s"} across {analysis.sections.length} area
              {analysis.sections.length === 1 ? "" : "s"}
            </p>
            <span
              className={cx(
                "rounded-md px-2 py-0.5 text-xs font-bold",
                analysis.overallConfidence >= LOW_CONFIDENCE
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              )}
            >
              {Math.round(analysis.overallConfidence * 100)}% confidence
            </span>
          </div>

          {imageUrl && (
            <div className="relative overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Uploaded floor plan" className="block w-full" />
              {analysis.tables.map((t) => (
                <div
                  key={t.tempId}
                  title={`Table ${t.number ?? "?"} · ${t.seats} seats`}
                  className={cx(
                    "absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[10px] font-bold text-white",
                    t.confidence < LOW_CONFIDENCE ? "border-amber-400 bg-amber-500/80" : "border-white bg-sky-500/80"
                  )}
                  style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
                >
                  {t.number ?? "?"}
                </div>
              ))}
            </div>
          )}

          {analysis.notes.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <p className="mb-1 font-semibold">The AI wasn&apos;t sure about:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {analysis.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="block text-xs text-neutral-500">
            Room name (for the floor-plan room switcher)
            <input
              className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </label>

          <div className="space-y-2">
            {analysis.sections.map((sec) => (
              <div key={sec.tempId} className="rounded-lg border border-black/10 p-2 dark:border-white/10">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="flex-1 rounded-md border border-black/10 bg-white px-2 py-1 text-sm font-semibold text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    value={sec.name}
                    onChange={(e) => updateSectionName(sec.tempId, e.target.value)}
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
                    <input
                      type="checkbox"
                      checked={sec.isOutdoor}
                      onChange={(e) =>
                        setAnalysis((a) =>
                          a
                            ? { ...a, sections: a.sections.map((s) => (s.tempId === sec.tempId ? { ...s, isOutdoor: e.target.checked } : s)) }
                            : a
                        )
                      }
                    />
                    Outdoor
                  </label>
                </div>

                <div className="space-y-1.5">
                  {analysis.tables
                    .filter((t) => t.sectionTempId === sec.tempId)
                    .map((t) => {
                      const needsConfirm = t.confidence < LOW_CONFIDENCE;
                      return (
                        <div
                          key={t.tempId}
                          className={cx(
                            "flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm",
                            needsConfirm
                              ? "border-amber-500/40 bg-amber-500/[0.06]"
                              : "border-black/5 bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.02]"
                          )}
                        >
                          <input
                            type="number"
                            value={t.number ?? ""}
                            placeholder="#"
                            onChange={(e) => updateTable(t.tempId, { number: e.target.value ? Number(e.target.value) : null })}
                            className="w-16 rounded-md border border-black/10 bg-white px-2 py-1 dark:border-white/15 dark:bg-white/5 dark:text-white"
                          />
                          <select
                            value={t.shape}
                            onChange={(e) => updateTable(t.tempId, { shape: e.target.value as DetectedTable["shape"] })}
                            className="rounded-md border border-black/10 bg-white px-2 py-1 dark:border-white/15 dark:bg-white/5 dark:text-white"
                          >
                            <option value="ROUND">Round</option>
                            <option value="SQUARE">Square</option>
                            <option value="RECT">Rectangular</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={t.seats}
                            onChange={(e) => updateTable(t.tempId, { seats: Math.max(1, Number(e.target.value)) })}
                            className="w-16 rounded-md border border-black/10 bg-white px-2 py-1 dark:border-white/15 dark:bg-white/5 dark:text-white"
                          />
                          <span className="text-xs text-neutral-400">seats</span>
                          {t.mergedWithTempId && (
                            <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
                              merged
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-2">
                            {needsConfirm && (
                              <label className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                <input
                                  type="checkbox"
                                  checked={confirmedLow.has(t.tempId)}
                                  onChange={(e) =>
                                    setConfirmedLow((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(t.tempId);
                                      else next.delete(t.tempId);
                                      return next;
                                    })
                                  }
                                />
                                Confirm ({Math.round(t.confidence * 100)}%)
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAnalysis(null);
                setFile(null);
                setImageUrl(null);
              }}
              disabled={busy}
            >
              Start over
            </Button>
            <Button variant="primary" className="flex-1" disabled={busy || !allLowConfirmed} onClick={apply}>
              {busy ? "Adding…" : `Add ${analysis.tables.length} tables to floor plan`}
            </Button>
          </div>
          {!allLowConfirmed && lowConfidenceTables.length > 0 && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400">
              Confirm the {lowConfidenceTables.length} low-confidence table{lowConfidenceTables.length === 1 ? "" : "s"} above first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
