"use client";

import { Button } from "./ui";
import { money } from "@/lib/host/format";

// The one question worth stopping for: marking a no-show can take money
// from a guest's card, so it's never a single tap. Staff see exactly what
// will be charged and choose to charge it or let it go — and can back out
// if the button was pressed by mistake.
export function NoShowConfirm({
  customerName,
  partySize,
  hasCardOnFile,
  feePerPersonCents,
  busy,
  onConfirm,
  onCancel,
}: {
  customerName: string;
  partySize: number;
  hasCardOnFile: boolean;
  feePerPersonCents: number | null;
  busy: boolean;
  onConfirm: (chargeFee: boolean) => void;
  onCancel: () => void;
}) {
  const feeCents = feePerPersonCents ? feePerPersonCents * partySize : 0;
  const canCharge = hasCardOnFile && feeCents > 0;

  return (
    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-2.5 text-xs">
      <p className="font-semibold text-neutral-900 dark:text-white">Mark {customerName} as a no-show?</p>
      <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">
        {canCharge
          ? `They left a card. The no-show fee is ${money(feeCents / 100)} (${money(feePerPersonCents! / 100)} × ${partySize} guests).`
          : hasCardOnFile
            ? "They left a card, but no no-show fee is set up in Settings — nothing will be charged."
            : "No card on file — nothing will be charged."}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {canCharge ? (
          <>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => onConfirm(true)}>
              Charge {money(feeCents / 100)}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onConfirm(false)}>
              No show, don&apos;t charge
            </Button>
          </>
        ) : (
          <Button size="sm" variant="danger" disabled={busy} onClick={() => onConfirm(false)}>
            Mark no-show
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Back
        </Button>
      </div>
    </div>
  );
}
