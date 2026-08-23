"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api, ApiError } from "@/lib/client";
import { Skeleton, EmptyState, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, TypeIcon, DueBadge } from "@/components/tickets/badges";
import { useToast } from "@/components/providers";
import { dueLabel, fmtDate, timeAgo } from "@/lib/utils";

type Profile = {
  user: {
    id: string; firstName: string; lastName: string; email: string;
    jobTitle: string | null; phone: string | null; timeZone: string | null;
    status: string; lastLoginAt: string | null; createdAt: string;
    role: { id: string; name: string };
    team: { id: string; name: string; managerName: string | null } | null;
  };
  stats: { assignedOpen: number; assignedDone: number; overdue: number; avgResolutionDays: number | null };
};

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Profile | null>(null);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; permissions: string[] } | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    api<Profile>("/api/users/" + id).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Failed"));
    api<{ tickets: TicketRow[] }>("/api/tickets?assigneeId=" + id + "&pageSize=15&sort=updated_desc").then((d) => setTickets(d.tickets)).catch(() => setTickets([]));
    api<{ user: { id: string; permissions: string[] } }>("/api/auth/me").then((d) => {
      setMe(d.user);
      if (d.user.permissions.includes("*") || d.user.permissions.includes("team.manage")) {
        api<{ teams: { id: string; name: string }[] }>("/api/teams").then((t) => setTeams(t.teams)).catch(() => {});
      }
    }).catch(() => {});
  }, [id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data || !tickets) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-72" /></div>;

  const u = data.user;
  const s = data.stats;
  const completion = s.assignedOpen + s.assignedDone > 0 ? Math.round((s.assignedDone / (s.assignedOpen + s.assignedDone)) * 100) : null;

  const changeTeam = async (teamId: string) => {
    try {
      await api("/api/users/" + id, { method: "PATCH", json: { teamId: teamId || null } });
      toast({ title: "Team updated", variant: "success" });
      const d = await api<Profile>("/api/users/" + id);
      setData(d);
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Update failed", variant: "error" });
    }
  };

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/users" className="hover:text-primary hover:underline">Users</Link> / <span className="font-semibold text-foreground">{u.firstName} {u.lastName}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-sm">
        <Avatar user={u} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            {u.firstName} {u.lastName}
            <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium">{u.role.name}</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {u.jobTitle ? u.jobTitle + " · " : ""}{u.email}{u.phone ? " · " + u.phone : ""}{u.timeZone ? " · " + u.timeZone : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Team: <b>{u.team?.name ?? "None"}</b>{u.team?.managerName ? <> · Manager: {u.team.managerName}</> : null} · Last login: {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"} · Joined {fmtDate(u.createdAt)}
          </p>
        </div>
        {me && (me.permissions.includes("*") || me.permissions.includes("team.manage")) && teams.length > 0 && (
          <div className="w-44">
            <Label>Change team</Label>
            <Select value={u.team?.id ?? ""} onChange={(e) => void changeTeam(e.target.value)}>
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ["Open tickets", s.assignedOpen, ""],
          ["Completed", s.assignedDone, "text-success"],
          ["Overdue", s.overdue, s.overdue > 0 ? "text-destructive" : ""],
          ["Completion rate", completion === null ? "-" : completion + "%", ""],
          ["Avg resolution", s.avgResolutionDays === null ? "-" : s.avgResolutionDays + " days", ""],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className={"text-2xl font-bold tabular-nums " + cls}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-card shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Assigned tickets</h2>
        {tickets.length === 0 ? (
          <EmptyState title="No assigned tickets" />
        ) : (
          <ul className="divide-y">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={"/tickets/" + t.key} className="-mx-0 flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <TypeIcon name={t.type.name} size="sm" />
                  <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">{t.projectKey}-{t.key.split("-").pop()}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                  <StatusBadge name={t.status.name} color={t.status.color} size="sm" />
                  <PriorityBadge name={t.priority.name} color={t.priority.color} compact />
                  <DueBadge {...dueLabel(t.dueDate)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WorkloadChart userId={id} />
    </div>
  );
}

function WorkloadChart({ userId }: { userId: string }) {
  const [data, setData] = useState<{ day: string; created: number }[] | null>(null);
  useEffect(() => {
    fetch(`/api/reports?type=user-trend&userId=${userId}`).then(async (r) => {
      if (!r.ok) throw new Error();
      setData((await r.json()).rows);
    }).catch(() => setData([]));
  }, [userId]);

  if (!data || data.length === 0) return null;
  void userId;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">Tickets created for this user - last 30 days</h2>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Bar dataKey="created" fill="#3f3f46" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[10px] text-muted-foreground">Counts reflect assignment volume only and are not a performance score.</p>
    </section>
  );
}

type TicketRow = {
  id: string; key: string; title: string; projectKey: string;
  type: { name: string };
  status: { id: string; name: string; color: string };
  priority: { name: string; color: string };
  dueDate: string | null;
};
