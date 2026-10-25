"use client";

import { useEffect, useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { HostRole, TeamMember } from "@/lib/host/client";

const ROLE_META: Record<HostRole, { label: string; blurb: string; color: string }> = {
  OWNER: { label: "Owner", blurb: "Everything, including billing and who's on the team.", color: "#f59e0b" },
  MANAGER: { label: "Manager", blurb: "Runs the floor and changes settings: hours, tables, areas, emails.", color: "#3b82f6" },
  STAFF: { label: "Staff", blurb: "Runs the floor: seat, release, walk-ins, bookings. No settings.", color: "#22c55e" },
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function TeamSettings({ viewerRole }: { viewerRole: HostRole }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HostRole>("STAFF");
  const [inviting, setInviting] = useState(false);
  const canManage = viewerRole === "OWNER";

  useEffect(() => {
    api.fetchTeam().then(setMembers).catch((e) => setError((e as Error).message));
  }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true); setError(null); setNote(null);
    try {
      const m = await api.inviteTeamMember({ name, email, role });
      setMembers((prev) => [...(prev ?? []), m]);
      setNote(`Invite sent to ${m.email}. They choose a password from the link and are in.`);
      setName(""); setEmail(""); setRole("STAFF");
    } catch (err) { setError((err as Error).message); } finally { setInviting(false); }
  };

  const changeRole = async (m: TeamMember, next: HostRole) => {
    setBusyId(m.id); setError(null); setNote(null);
    try {
      await api.updateTeamRole(m.id, next);
      setMembers((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, role: next } : x)));
    } catch (err) { setError((err as Error).message); } finally { setBusyId(null); }
  };

  const remove = async (m: TeamMember) => {
    if (!window.confirm(`Remove ${m.name} (${m.email})? They're signed out everywhere immediately.`)) return;
    setBusyId(m.id); setError(null); setNote(null);
    try {
      await api.removeTeamMember(m.id);
      setMembers((prev) => (prev ?? []).filter((x) => x.id !== m.id));
    } catch (err) { setError((err as Error).message); } finally { setBusyId(null); }
  };

  const resend = async (m: TeamMember) => {
    setBusyId(m.id); setError(null); setNote(null);
    try {
      await api.resendTeamInvite(m.id);
      setNote(`A fresh invite is on its way to ${m.email}.`);
    } catch (err) { setError((err as Error).message); } finally { setBusyId(null); }
  };

  const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-500 dark:border-white/15 dark:bg-white/5 dark:text-white";

  return (
    <div className="space-y-4">
      {error && <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      {note && <Card className="border-green-500/30 bg-green-500/10 p-4 text-sm text-green-700 dark:text-green-400">{note}</Card>}

      <Card className="p-5">
        <SectionTitle>Who can sign in</SectionTitle>
        <p className="mb-4 text-sm text-neutral-500">
          Everyone gets their own login, so you can see who did what and switch someone off the moment they leave. Three levels:
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {(Object.keys(ROLE_META) as HostRole[]).map((r) => (
            <div key={r} className="rounded-lg border border-black/5 p-3 text-xs dark:border-white/10">
              <span className="rounded-md px-1.5 py-0.5 font-semibold text-white" style={{ backgroundColor: ROLE_META[r].color }}>{ROLE_META[r].label}</span>
              <p className="mt-2 text-neutral-500">{ROLE_META[r].blurb}</p>
            </div>
          ))}
        </div>

        {members === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {members.map((m) => (
              <div key={m.id} className={"flex flex-wrap items-center gap-3 py-3 " + (busyId === m.id ? "opacity-60" : "")}>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: ROLE_META[m.role].color }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                    {m.name} {m.isYou && <span className="text-xs font-normal text-neutral-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {m.email} · {m.pending ? "invite sent, not signed in yet" : `last sign-in ${relative(m.lastLoginAt)}`}
                  </p>
                </div>
                {canManage ? (
                  <select
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => changeRole(m, e.target.value as HostRole)}
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900 dark:text-white"
                  >
                    {(Object.keys(ROLE_META) as HostRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_META[r].label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-md px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: ROLE_META[m.role].color }}>{ROLE_META[m.role].label}</span>
                )}
                {canManage && m.pending && (
                  <Button size="sm" disabled={busyId === m.id} onClick={() => resend(m)}>Resend invite</Button>
                )}
                {canManage && !m.isYou && (
                  <Button size="sm" variant="danger" disabled={busyId === m.id} onClick={() => remove(m)}>Remove</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {canManage && (
        <Card className="p-5">
          <SectionTitle>Add someone</SectionTitle>
          <p className="mb-3 text-sm text-neutral-500">They get an email with a link to choose their own password. You never need to share yours.</p>
          <form onSubmit={invite} className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto_auto] sm:items-end">
            <label className="text-xs text-neutral-500">
              Name
              <input className={field + " mt-1"} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" />
            </label>
            <label className="text-xs text-neutral-500">
              Email
              <input className={field + " mt-1"} required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@example.com" />
            </label>
            <label className="text-xs text-neutral-500">
              Role
              <select className={field + " mt-1"} value={role} onChange={(e) => setRole(e.target.value as HostRole)}>
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="OWNER">Owner</option>
              </select>
            </label>
            <Button variant="primary" disabled={inviting || !name.trim() || !email.trim()}>{inviting ? "Sending…" : "Send invite"}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
