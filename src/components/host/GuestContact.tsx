"use client";

// Phone and email for a booking, as links a host can tap on an iPad:
// tel: dials, mailto: opens a draft. Shown wherever a booking is shown, so
// "I need to confirm this party" never means hunting for the number.
export function GuestContact({ phone, email, notes, compact = false }: { phone: string | null; email: string | null; notes?: string | null; compact?: boolean }) {
  if (!phone && !email && !notes) {
    return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">No contact details</span>;
  }
  const link = "underline decoration-dotted underline-offset-2 hover:text-neutral-900 dark:hover:text-white";
  return (
    <span className={"flex flex-wrap items-center gap-x-2 gap-y-0.5 " + (compact ? "text-[11px]" : "text-xs")}>
      {phone && (
        <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className={link} onClick={(e) => e.stopPropagation()}>
          📞 {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={link + " max-w-[220px] truncate"} onClick={(e) => e.stopPropagation()} title={email}>
          ✉️ {email}
        </a>
      )}
      {notes && <span className="text-neutral-500" title={notes}>📝 {notes.length > 60 ? notes.slice(0, 60) + "…" : notes}</span>}
    </span>
  );
}
