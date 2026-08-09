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

// Lays out each section's tables in its own vertical band of the shared 0..1
// canvas applyFloorPlan expects (the same normalized space the AI-import
// flow produces from a real photo) — grid-arranged within the band so
// nothing overlaps, with generous padding since these are starting
// positions the host is about to drag around anyway, not a finished layout.
function buildTemplatePayload(sections: TemplateSection[]): { sections: DetectedSection[]; tables: DetectedTable[] } {
  const bandWidth = 1 / sections.length;
  const outSections: DetectedSection[] = [];
  const outTables: DetectedTable[] = [];
  sections.forEach((sec, sIdx) => {
    const tempId = `sec-${sIdx}`;
    outSections.push({ tempId, name: sec.name, isOutdoor: sec.isOutdoor });
    const n = sec.seatsPool.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xInBand = cols === 1 ? 0.5 : (col + 0.5) / cols;
      const x = sIdx * bandWidth + xInBand * bandWidth * 0.82 + bandWidth * 0.09;
      const y = 0.12 + ((row + 0.5) / rows) * 0.76;
      const seats = sec.seatsPool[i];
      outTables.push({
        tempId: `t-${sIdx}-${i}`,
        number: null,
        shape: seats <= 2 ? "ROUND" : seats <= 4 ? "SQUARE" : "RECT",
        seats,
        x,
        y,
        rotation: 0,
        mergedWithTempId: null,
        sectionTempId: tempId,
        confidence: 1,
      });
    }
  });
  return { sections: outSections, tables: outTables };
}

export function FloorPlanBuilder({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableCount, setTableCount] = useState<number | null>(null);
  const [floor, setFloor] = useState<FloorState | null>(null);
  const [manualRows, setManualRows] = useState<{ seats: number; shape: DetectedTable["shape"] }[]>([
    { seats: 2, shape: "ROUND" },
  ]);
  const [manualArea, setManualArea] = useState("Main Room");

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
    if (manualRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const payload = buildTemplatePayload([{ name: manualArea || "Main Room", isOutdoor: false, seatsPool: manualRows.map((r) => r.seats) }]);
      // Grid-position generation already picked a shape from seat count;
      // honour whatever shape the host actually chose per row instead.
      payload.tables.forEach((t, i) => (t.shape = manualRows[i].shape));
      const result = await api.applyFloorPlan({ room: "Main Room", sections: payload.sections, tables: payload.tables });
      await afterApply(result.tableCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
          <label className="block text-xs text-hf-inkMuted">
            Area name
            <input
              className={inputCls}
              value={manualArea}
              onChange={(e) => setManualArea(e.target.value)}
              placeholder="Main Room"
            />
          </label>
          <div className="space-y-1.5">
            {manualRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className={cx(inputCls, "mt-0 w-24")}
                  value={row.shape}
                  onChange={(e) =>
                    setManualRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, shape: e.target.value as DetectedTable["shape"] } : r)))
                  }
                >
                  <option value="ROUND">Round</option>
                  <option value="SQUARE">Square</option>
                  <option value="RECT">Rect</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className={cx(inputCls, "mt-0 w-20")}
                  value={row.seats}
                  onChange={(e) =>
                    setManualRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, seats: Math.max(1, Number(e.target.value)) } : r)))
                  }
                />
                <span className="text-xs text-hf-inkMuted">seats</span>
                <button
                  className="ml-auto text-xs text-red-400 hover:underline disabled:opacity-30"
                  disabled={manualRows.length === 1}
                  onClick={() => setManualRows((rs) => rs.filter((_, ri) => ri !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={() => setManualRows((rs) => [...rs, { seats: 2, shape: "ROUND" }])}>
            + Add another table
          </Button>
          <Button variant="primary" className="w-full" disabled={busy} onClick={submitManual}>
            {busy ? "Creating…" : `Create ${manualRows.length} table${manualRows.length === 1 ? "" : "s"}`}
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
