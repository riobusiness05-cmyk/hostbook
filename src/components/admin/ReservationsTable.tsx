"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RESERVATION_STATUSES } from "@/types";

type Row = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  partySize: number;
  date: string;
  time: string;
  tableName: string | null;
  status: string;
  source: string;
  notes: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-neutral-200 text-neutral-500",
  COMPLETED: "bg-blue-100 text-blue-800",
  NO_SHOW: "bg-red-100 text-red-800",
};

export default function ReservationsTable({
  initialReservations,
  filterDate,
}: {
  initialReservations: Row[];
  filterDate: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialReservations);
  const [date, setDate] = useState(filterDate);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } finally {
      setBusyId(null);
    }
  }

  function applyDateFilter() {
    router.push(date ? `/admin/reservations?date=${date}` : "/admin/reservations");
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
        />
        <button
          onClick={applyDateFilter}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Filter
        </button>
        {date && (
          <button
            onClick={() => {
              setDate("");
              router.push("/admin/reservations");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Clear (showing upcoming)
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No reservations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-neutral-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Party</th>
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-black/5 align-top">
                  <td className="py-2 pr-3">{r.date}</td>
                  <td className="py-2 pr-3">{r.time}</td>
                  <td className="py-2 pr-3">
                    {r.customerName}
                    {r.notes && <div className="text-xs text-neutral-400">{r.notes}</div>}
                  </td>
                  <td className="py-2 pr-3 text-neutral-500">
                    {r.customerEmail && <div>{r.customerEmail}</div>}
                    {r.customerPhone && <div>{r.customerPhone}</div>}
                  </td>
                  <td className="py-2 pr-3">{r.partySize}</td>
                  <td className="py-2 pr-3">{r.tableName ?? "—"}</td>
                  <td className="py-2 pr-3 text-neutral-500">{r.source.replace("_", " ")}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={r.status}
                      disabled={busyId === r.id}
                      onChange={(e) => updateStatus(r.id, e.target.value)}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[r.status] ?? ""}`}
                    >
                      {RESERVATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
