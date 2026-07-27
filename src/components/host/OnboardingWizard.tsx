"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/host/client";
import { Button } from "./ui";
import { FloorPlanImport } from "./FloorPlanImport";
import { cx } from "@/lib/host/format";

type Step = "settings" | "hours" | "floorplan" | "done";
const STEPS: Step[] = ["settings", "hours", "floorplan", "done"];

const TIMEZONES = [
  "Atlantic/Canary",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Europe/Lisbon",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

// Shown once, right after signup, before /host is reachable (see host/page.tsx's
// redirect). Every field here maps to a real, already-consumed setting —
// nothing here is a fake control that doesn't do anything (see
// GeneralSettings.tsx's comments on the same principle). Every step can be
// skipped; the wizard never traps a host who just wants to look around.
export function OnboardingWizard({ restaurantName }: { restaurantName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tablesAdded, setTablesAdded] = useState<number | null>(null);

  const [avgDiningMinutes, setAvgDiningMinutes] = useState(90);
  const [bookingIntervalMinutes, setBookingIntervalMinutes] = useState(30);
  const [maxBookingsPer15Min, setMaxBookingsPer15Min] = useState(6);
  const [depositPerPerson, setDepositPerPerson] = useState<number | "">("");
  const [serviceChargePct, setServiceChargePct] = useState<number | "">("");
  const [walkinsEnabled, setWalkinsEnabled] = useState(true);
  const [tableMergingEnabled, setTableMergingEnabled] = useState(true);
  const [timezone, setTimezone] = useState("Atlantic/Canary");

  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("23:00");

  const stepIndex = STEPS.indexOf(step);

  const saveSettings = async () => {
    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        api.updateSettings({
          avgDiningMinutes,
          bookingIntervalMinutes,
          maxBookingsPer15Min,
          depositPerPersonCents: depositPerPerson === "" ? null : Math.round(depositPerPerson * 100),
          serviceChargePct: serviceChargePct === "" ? null : serviceChargePct,
          walkinsEnabled,
          tableMergingEnabled,
        }),
        api.updateRestaurant({ timezone }),
      ]);
      setStep("hours");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveHours = async (skip: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (!skip) {
        const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          openTime,
          closeTime,
          isClosed: false,
        }));
        await api.updateHours(days);
      }
      setStep("floorplan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateRestaurant({ onboardingCompletedAt: true });
      router.push("/host");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white">Welcome to Host Flow, {restaurantName}</h1>
        <p className="mt-1 text-sm text-neutral-400">A few quick settings, then you&apos;re on the floor.</p>
      </div>

      <div className="mb-6 flex justify-center gap-1.5">
        {STEPS.map((s, i) => (
          <span key={s} className={cx("h-1.5 w-10 rounded-full", i <= stepIndex ? "bg-white" : "bg-white/15")} />
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        {step === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">How your floor runs</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Average dining duration (min)">
                <input type="number" min={30} max={240} className={inputCls} value={avgDiningMinutes} onChange={(e) => setAvgDiningMinutes(Number(e.target.value))} />
              </Field>
              <Field label="Minutes between booking slots">
                <input type="number" min={5} max={120} className={inputCls} value={bookingIntervalMinutes} onChange={(e) => setBookingIntervalMinutes(Number(e.target.value))} />
              </Field>
              <Field label="Max bookings per 15 min">
                <input type="number" min={1} max={50} className={inputCls} value={maxBookingsPer15Min} onChange={(e) => setMaxBookingsPer15Min(Number(e.target.value))} />
              </Field>
              <Field label="Timezone">
                <select className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Deposit per person (€, optional)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={depositPerPerson}
                  onChange={(e) => setDepositPerPerson(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="None"
                />
              </Field>
              <Field label="Service charge % (optional)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={serviceChargePct}
                  onChange={(e) => setServiceChargePct(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="None"
                />
              </Field>
            </div>
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={walkinsEnabled} onChange={(e) => setWalkinsEnabled(e.target.checked)} />
                Walk-ins enabled
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={tableMergingEnabled} onChange={(e) => setTableMergingEnabled(e.target.checked)} />
                Table merging enabled
              </label>
            </div>
            <Button variant="primary" className="w-full" disabled={busy} onClick={saveSettings}>
              {busy ? "Saving…" : "Continue"}
            </Button>
          </div>
        )}

        {step === "hours" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Opening hours</h2>
            <p className="text-xs text-neutral-400">
              Applied to every day for now — fine-tune individual days later in Settings → Hours.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opens">
                <input type="time" className={inputCls} value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              </Field>
              <Field label="Closes">
                <input type="time" className={inputCls} value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => saveHours(true)}>
                Skip
              </Button>
              <Button variant="primary" className="flex-1" disabled={busy} onClick={() => saveHours(false)}>
                {busy ? "Saving…" : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {step === "floorplan" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Your floor plan</h2>
            {tablesAdded === null ? (
              <>
                <p className="text-xs text-neutral-400">
                  Upload a photo of your real floor plan or POS table map — the AI detects your tables, you review, then
                  it&apos;s ready to use (and always editable afterward).
                </p>
                <FloorPlanImport onApplied={({ tableCount }) => setTablesAdded(tableCount)} />
                <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setStep("done")}>
                  Skip — I&apos;ll build my floor plan manually
                </Button>
              </>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-sm text-green-400">Added {tablesAdded} tables to your floor plan.</p>
                <Button variant="primary" className="w-full" onClick={() => setStep("done")}>
                  Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-semibold text-white">You&apos;re all set</h2>
            <p className="text-sm text-neutral-400">Head to your live floor — you can change any of this later in Settings.</p>
            <Button variant="primary" className="w-full" disabled={busy} onClick={finish}>
              {busy ? "Opening…" : "Go to my floor"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-neutral-400">
      {label}
      {children}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-sky-500";
