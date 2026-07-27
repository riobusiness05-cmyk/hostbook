"use client";

import { useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { TableRow } from "@/lib/host/client";
import { FloorPlanImport } from "./FloorPlanImport";

export function TableAvailabilitySettings({ initialTables }: { initialTables: TableRow[] }) {
  const [tables, setTables] = useState(initialTables);
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
              setImportedMsg(`Added ${tableCount} tables — reloading…`);
              setTimeout(() => window.location.reload(), 1200);
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
