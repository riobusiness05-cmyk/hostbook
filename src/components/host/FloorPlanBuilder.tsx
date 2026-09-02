"use client";

import { useState } from "react";
import * as api from "@/lib/host/client";
import type { DetectedSection, DetectedTable } from "@/lib/host/client";
import type { FloorState } from "@/lib/hostflow/floor";
import { Button } from "./ui";
import { FloorPlanImport } from "./FloorPlanImport";
import { FloorPlan } from "./FloorPlan";
import { cx } from "@/lib/host/format";

// The onboarding "build your floor plan" step. Previously this only offered
// an AI photo import or a flat skip — anyone without a floor-plan photo
// handy had no easy path. Now there are three ways to get tables onto the
// plan (template, manual add, or the existing photo import), and whichever
// one is used lands on the same "arrange" screen: the real drag-and-drop
// floor editor, opened straight into edit mode, so a host can drag the
// auto-placed tables into roughly their real layout before ever leaving
// onboarding.

type Mode = "choose" | "template" | "manual" | "photo" | "arrange";

type TemplateSection = { name: string; isOutdoor: boolean; seatsPool: number[] };

const TEMPLATES: { key: string; label: string; blurb: string; sections: TemplateSection[] }[] = [
  {
    key: "small",
    label: "Small café",
    blurb: "8 tables, one room",
    sections: [{ name: "Main Room", isOutdoor: false, seatsPool: [2, 2, 4, 2, 4, 2, 4, 2] }],
  },
  {
    key: "medium",
    label: "Mid-size restaurant",
    blurb: "18 tables, indoor + patio",
    sections: [
      { name: "Main Room", isOutdoor: false, seatsPool: [2, 4, 2, 4, 4, 2, 4, 2, 6, 4, 2, 4] },
      { name: "Patio", isOutdoor: true, seatsPool: [2, 4, 2, 4, 2, 4] },
    ],
  },
  {
    key: "large",
    label: "Large restaurant",
    blurb: "30 tables, multiple areas",
    sections: [
      { name: "Main Room", isOutdoor: false, seatsPool: [2, 4, 2, 4, 4, 6, 2, 4, 2, 4, 4, 2, 6, 4, 2, 4] },
      { name: "Patio", isOutdoor: true, seatsPool: [2, 4, 2, 4, 2, 4, 2, 4] },
      { name: "Bar", isOutdoor: false, seatsPool: [2, 2, 2, 2, 4, 2] },
    ],
  },
  {
    key: "bar",
    label: "Bar / lounge",
    blurb: "14 tables, mostly small high-tops",
    sections: [{ name: "Bar", isOutdoor: false, seatsPool: [2, 2, 2, 4, 2, 2, 4, 2, 2, 2, 4, 2, 2, 4] }],
  },
];

// One table's worth of manual input — richer than TemplateSection's bare
// seatsPool since a host typing tables in one at a time (unlike a
// template) can and should give each one its own real number/shape.
type ManualTableInput = { number: number | null; seats: number; shape: DetectedTable["shape"] };
type SectionInput = { name: string; isOutdoor: boolean; tables: ManualTableInput[] };

// Lays out each section's tables in its own vertical band of the shared 0..1
// canvas applyFloorPlan expects (the same normalized space the AI-import
// flow produces from a real photo) — grid-arranged within the band so
// nothing overlaps, with generous padding since these are starting
// positions the host is about to drag around anyway, not a finished layout.
// Shared by the template path (seat counts only, shape inferred, no real
// numbers) and the manual-entry path (host-typed number/shape per table).
function buildSectionsPayload(sections: SectionInput[]): { sections: DetectedSection[]; tables: DetectedTable[] } {
  const bandWidth = 1 / sections.length;
  const outSections: DetectedSection[] = [];
  const outTables: DetectedTable[] = [];
  sections.forEach((sec, sIdx) => {
    const tempId = `sec-${sIdx}`;
    outSections.push({ tempId, name: sec.name, isOutdoor: sec.isOutdoor });
    const n = sec.tables.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)));
    const rows = Math.ceil(n / cols);
    sec.tables.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xInBand = cols === 1 ? 0.5 : (col + 0.5) / cols;
      const x = sIdx * bandWidth + xInBand * bandWidth * 0.82 + bandWidth * 0.09;
      const y = 0.12 + ((row + 0.5) / rows) * 0.76;
      outTables.push({
        tempId: `t-${sIdx}-${i}`,
        number: t.number,
        shape: t.shape,
        seats: t.seats,
        x,
        y,
        rotation: 0,
        mergedWithTempId: null,
        sectionTempId: tempId,
        confidence: 1,
      });
    });
  });
  return { sections: outSections, tables: outTables };
}

function buildTemplatePayload(sections: TemplateSection[]): { sections: DetectedSection[]; tables: DetectedTable[] } {
  return buildSectionsPayload(
    sections.map((sec) => ({
      name: sec.name,
      isOutdoor: sec.isOutdoor,
      tables: sec.seatsPool.map((seats) => ({
        number: null,
        seats,
        shape: seats <= 2 ? "ROUND" : seats <= 4 ? "SQUARE" : "RECT",
      })),
    }))
  );
}

export function FloorPlanBuilder({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableCount, setTableCount] = useState<number | null>(null);
  const [floor, setFloor] = useState<FloorState | null>(null);
  // One block per real area of the venue (Main Room, Patio, Bar, ...) —
  // each with its own name and its own list of tables, so a host can
  // describe their actual venue's layout instead of being limited to one
  // flat table list. "number" is optional per table; left blank, the
  // table gets auto-numbered same as before.
  const [manualSections, setManualSections] = useState<
    { id: string; name: string; isOutdoor: boolean; rows: { id: string; number: string; seats: number; shape: DetectedTable["shape"] }[] }[]
  >([{ id: "ms-0", name: "Main Room", isOutdoor: false, rows: [{ id: "mr-0", number: "", seats: 2, shape: "ROUND" }] }]);
  const manualTableTotal = manualSections.reduce((n, s) => n + s.rows.length, 0);

  const afterApply = async (count: number) => {
    setTableCount(count);
    const state = await api.fetchFloor();
    setFloor(state);
    setMode("arrange");
  };

  const applyTemplate = async (key: string) => {
    const t = TEMPLATES.find((t) => t.key === key);
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const payload = buildTemplatePayload(t.sections);
      const result = await api.applyFloorPlan({ room: "Main Room", sections: payload.sections, tables: payload.tables });
      await afterApply(result.tableCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async () => {
    const nonEmptySections = manualSections.filter((s) => s.rows.length > 0);
    if (nonEmptySections.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const payload = buildSectionsPayload(
        nonEmptySections.map((s) => ({
          name: s.name.trim() || "Main Room",
          isOutdoor: s.isOutdoor,
          tables: s.rows.map((r) => ({
            number: r.number.trim() ? Number(r.number) : null,
            seats: r.seats,
            shape: r.shape,
          })),
        }))
      );
      const result = await api.applyFloorPlan({ room: "Main Room", sections: payload.sections, tables: payload.tables });
      await afterApply(result.tableCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addManualSection = () =>
    setManualSections((prev) => [
      ...prev,
      { id: `ms-${Date.now()}`, name: "", isOutdoor: false, rows: [{ id: `mr-${Date.now()}`, number: "", seats: 2, shape: "ROUND" }] },
    ]);
  const removeManualSection = (sectionId: string) =>
    setManualSections((prev) => prev.filter((s) => s.id !== sectionId));
  const addManualRow = (sectionId: string) =>
    setManualSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, rows: [...s.rows, { id: `mr-${Date.now()}`, number: "", seats: 2, shape: "ROUND" }] } : s))
    );
  const removeManualRow = (sectionId: string, rowId: string) =>
    setManualSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s)));
  const updateManualSection = (sectionId: string, patch: Partial<{ name: string; isOutdoor: boolean }>) =>
    setManualSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
  const updateManualRow = (
    sectionId: string,
    rowId: string,
    patch: Partial<{ number: string; seats: number; shape: DetectedTable["shape"] }>
  ) =>
    setManualSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, rows: s.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) } : s))
    );

  if (mode === "arrange" && floor) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-400">
          Added {tableCount} table{tableCount === 1 ? "" : "s"}. Drag them into roughly your real layout — you can
          always fine-tune this later.
        </p>
        {/* FloorPlan's own toolbar wraps onto 2-3 rows below ~640px wide,
            which eats into its fixed h-full budget — a short container
            then squeezes the actual table canvas down to nothing and the
            legend visually collides with the last row of tables. Enough
            height on small screens keeps everything legible. */}
        <div className="h-[60vh] min-h-[460px] overflow-hidden rounded-xl border border-hf-line sm:h-[50vh] sm:min-h-[360px]">
          <FloorPlan
            tables={floor.tables}
            sections={floor.sections}
            selectedId={null}
            onSelect={() => {}}
            refresh={async () => {
              const state = await api.fetchFloor();
              setFloor(state);
            }}
            setPaused={() => {}}
            defaultEditMode
            timezone={floor.timezone}
          />
        </div>
        <Button variant="primary" className="w-full" onClick={onDone}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      {mode === "choose" && (
        <>
          <p className="text-xs text-hf-inkMuted">Pick whichever is fastest for you — every option is fully editable afterward.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <ChooseCard
              title="Start from a template"
              blurb="Pick your venue size, get instant tables"
              icon="template"
              onClick={() => setMode("template")}
            />
            <ChooseCard
              title="Add tables one by one"
              blurb="Type in your table count and sizes"
              icon="manual"
              onClick={() => setMode("manual")}
            />
            <ChooseCard
              title="Upload a photo"
              blurb="AI detects tables from a real floor plan"
              icon="photo"
              onClick={() => setMode("photo")}
            />
          </div>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={onSkip}>
            Skip — I&apos;ll build my floor plan later
          </Button>
        </>
      )}

      {mode === "template" && (
        <>
          <button onClick={() => setMode("choose")} className="text-xs text-brand-300 hover:underline">
            ← Back
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                disabled={busy}
                onClick={() => applyTemplate(t.key)}
                className="rounded-xl border border-hf-line bg-hf-surfaceHi/60 p-4 text-left transition-colors hover:border-brand-400/40 hover:bg-hf-surfaceHi disabled:opacity-50"
              >
                <p className="font-semibold text-hf-ink">{t.label}</p>
                <p className="mt-0.5 text-xs text-hf-inkMuted">{t.blurb}</p>
              </button>
            ))}
          </div>
          {busy && <p className="text-center text-xs text-hf-inkMuted">Building your floor plan…</p>}
        </>
      )}

      {mode === "manual" && (
        <>
          <button onClick={() => setMode("choose")} className="text-xs text-brand-300 hover:underline">
            ← Back
          </button>
          <p className="text-xs text-hf-inkMuted">
            One block per area of your venue — Main Room, Patio, Bar, however you actually think about it. Table
            number is optional; leave it blank and it&apos;ll be numbered automatically.
          </p>

          <div className="space-y-3">
            {manualSections.map((sec) => (
              <div key={sec.id} className="rounded-xl border border-hf-line bg-hf-surfaceHi/60 p-3">
                <div className="mb-2.5 flex items-center gap-2">
                  <input
                    className={cx(inputCls, "mt-0 flex-1 font-semibold")}
                    value={sec.name}
                    onChange={(e) => updateManualSection(sec.id, { name: e.target.value })}
                    placeholder="Area name, e.g. Main Room"
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-hf-inkMuted">
                    <input
                      type="checkbox"
                      checked={sec.isOutdoor}
                      onChange={(e) => updateManualSection(sec.id, { isOutdoor: e.target.checked })}
                    />
                    Outdoor
                  </label>
                  {manualSections.length > 1 && (
                    <button
                      className="shrink-0 text-xs text-red-400 hover:underline"
                      onClick={() => removeManualSection(sec.id)}
                    >
                      Remove area
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {sec.rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="#"
                        title="Table number (optional — auto-numbered if left blank)"
                        className={cx(inputCls, "mt-0 w-16")}
                        value={row.number}
                        onChange={(e) => updateManualRow(sec.id, row.id, { number: e.target.value })}
                      />
                      <select
                        className={cx(inputCls, "mt-0 w-24")}
                        value={row.shape}
                        onChange={(e) => updateManualRow(sec.id, row.id, { shape: e.target.value as DetectedTable["shape"] })}
                      >
                        <option value="ROUND">Round</option>
                        <option value="SQUARE">Square</option>
                        <option value="RECT">Rect</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        className={cx(inputCls, "mt-0 w-20")}
                        value={row.seats}
                        onChange={(e) => updateManualRow(sec.id, row.id, { seats: Math.max(1, Number(e.target.value)) })}
                      />
                      <span className="text-xs text-hf-inkMuted">seats</span>
                      <button
                        className="ml-auto text-xs text-red-400 hover:underline disabled:opacity-30"
                        disabled={sec.rows.length === 1}
                        onClick={() => removeManualRow(sec.id, row.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 text-xs font-medium text-brand-300 hover:underline"
                  onClick={() => addManualRow(sec.id)}
                >
                  + Add a table to {sec.name.trim() || "this area"}
                </button>
              </div>
            ))}
          </div>

          <Button variant="ghost" className="w-full" onClick={addManualSection}>
            + Add another area
          </Button>
          <Button variant="primary" className="w-full" disabled={busy || manualTableTotal === 0} onClick={submitManual}>
            {busy
              ? "Creating…"
              : `Create ${manualTableTotal} table${manualTableTotal === 1 ? "" : "s"} across ${manualSections.length} area${manualSections.length === 1 ? "" : "s"}`}
          </Button>
        </>
      )}

      {mode === "photo" && (
        <>
          <button onClick={() => setMode("choose")} className="text-xs text-brand-300 hover:underline">
            ← Back
          </button>
          <p className="text-xs text-hf-inkMuted">
            Upload a photo of your real floor plan or POS table map — the AI detects your tables, you review, then
            it&apos;s ready to use.
          </p>
          <FloorPlanImport onApplied={({ tableCount }) => afterApply(tableCount)} />
        </>
      )}
    </div>
  );
}

function ChooseCard({
  title,
  blurb,
  icon,
  onClick,
}: {
  title: string;
  blurb: string;
  icon: "template" | "manual" | "photo";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-hf-line bg-hf-surfaceHi/60 p-4 text-left transition-colors hover:border-brand-400/40 hover:bg-hf-surfaceHi"
    >
      <div className="grid h-9 w-9 place-items-center rounded-lg border border-brand-400/25 bg-brand-500/10 text-brand-300">
        <BuilderIcon kind={icon} />
      </div>
      <p className="mt-2.5 font-semibold text-hf-ink">{title}</p>
      <p className="mt-0.5 text-xs text-hf-inkMuted">{blurb}</p>
    </button>
  );
}

function BuilderIcon({ kind }: { kind: "template" | "manual" | "photo" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "template") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
      </svg>
    );
  }
  if (kind === "manual") {
    return (
      <svg {...common}>
        <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z" />
        <path d="M13.5 6.5 17.5 10.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7 9.5 4h5L16 7" />
      <circle cx="12" cy="13.5" r="3.4" />
    </svg>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-hf-line bg-hf-surfaceHi px-3 py-2 text-sm text-hf-ink outline-none focus:border-brand-400";
