"use client";

import { useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { TableRow, SectionRow } from "@/lib/host/client";
import { FloorPlanImport } from "./FloorPlanImport";

// One row per area: what guests see on the booking form and whether they
// may choose it. Saves field by field on blur/toggle — no save button to forget.
function AreaRow({ section, onSaved, onError }: { section: SectionRow; onSaved: (s: SectionRow) => void; onError: (m: string) => void }) {
  const [name, setName] = useState(section.name);
  const [note, setNote] = useState(section.note ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<Pick<SectionRow, "name" | "note" | "bookableOnline" | "isOutdoor">>) => {
    setBusy(true);
    try {
      await api.updateSection(section.id, patch);
      onSaved({ ...section, ...patch, note: patch.note === undefined ? section.note : patch.note || null });
    } catch (e) {
      onError((e as Error).message);
      setName(section.name);
      setNote(section.note ?? "");
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500 dark:border-white/15 dark:bg-white/5 dark:text-white";
  return (
    <div className={"grid gap-2 rounded-xl border border-black/5 p-3 dark:border-white/10 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center " + (busy ? "opacity-60" : "")}>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">Area name</label>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== section.name && save({ name: name.trim() })} />
        <p className="mt-1 text-[11px] text-neutral-500">{section.tableCount} table{section.tableCount === 1 ? "" : "s"}</p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">Shown under the name (optional)</label>
        <input className={field} placeholder="e.g. Singers' stage visible from here" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => (note.trim() || null) !== (section.note ?? null) && save({ note: note.trim() || null })} />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={section.bookableOnline} onChange={(e) => save({ bookableOnline: e.target.checked })} />
          Guests can book this area online
        </label>
        <label className="flex items-center gap-2 text-neutral-500">
          <input type="checkbox" checked={section.isOutdoor} onChange={(e) => save({ isOutdoor: e.target.checked })} />
          Outdoor
        </label>
      </div>
    </div>
  );
}

export function TableAvailabilitySettings({ initialTables, initialSections = [] }: { initialTables: TableRow[]; initialSections?: SectionRow[] }) {
  const [tables, setTables] = useState(initialTables);
  const [sections, setSections] = useState(initialSections);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedMsg, setImportedMsg] = useState<string | null>(null);

  const toggle = async (id: string, isActive: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await api.tableAction(id, { action: "setActive", isActive });
      setTables((prev) => prev.map((t) => (t.id === id ? { ...t, isActive } : t)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</Card>
      )}

      {sections.length > 0 && (
        <Card className="p-5">
          <SectionTitle>Areas on the booking form</SectionTitle>
          <p className="mb-3 text-sm text-neutral-500">
            Guests booking online choose one of these. A chosen area is a promise — if it&apos;s full at that time they&apos;re told so and asked to pick
            another, never moved elsewhere. Untick an area to keep it for walk-ins and staff bookings only.
          </p>
          <div className="space-y-2">
            {sections.map((s) => (
              <AreaRow
                key={s.id}
                section={s}
                onSaved={(next) => setSections((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                onError={setError}
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle
          action={
            <Button size="sm" onClick={() => setImporting((v) => !v)}>
              {importing ? "Close" : "📷 Import from photo"}
            </Button>
          }
        >
          AI floor-plan import
        </SectionTitle>
        {importedMsg && (
          <p className="mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            {importedMsg}
          </p>
        )}
        {importing && (
          <FloorPlanImport
            onApplied={({ tableCount }) => {
              setImporting(false);
              // Straight to the live floor plan, not a settings-page
              // reload — after adding tables the whole point is to see
              // them, and "Edit layout" is right there if a drag-to-
              // arrange pass is wanted (positions are already a rough
              // match to the photo, not dropped in one pile).
              setImportedMsg(`Added ${tableCount} tables — taking you to your floor plan…`);
              setTimeout(() => {
                window.location.href = "/host";
              }, 900);
            }}
          />
        )}
        {!importing && !importedMsg && (
          <p className="text-xs text-neutral-400">
            Upload a photo of your real floor plan or POS table map and the AI will detect tables, seats, and layout —
            you review before anything is added, and every table stays fully editable afterward.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle>Table availability</SectionTitle>
        <p className="mb-3 text-xs text-neutral-400">
          Take a table out of service — it disappears from the floor plan and stops being offered for reservations
          or walk-ins until you switch it back on.
        </p>
        <div className="space-y-1">
          {tables.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-black/5 py-2 last:border-0 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  Table {t.tableNumber} — {t.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Seats {t.capacityMin}–{t.capacityMax}
                  {t.sectionName && ` · ${t.sectionName}`}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={busyId === t.id}
                  checked={t.isActive}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                />
                {t.isActive ? "Active" : "Out of service"}
              </label>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
