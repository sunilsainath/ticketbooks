"use client";

import Link from "next/link";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { api } from "@/lib/client";
import { Skeleton } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, TypeIcon } from "@/components/tickets/badges";
import { timeAgo } from "@/lib/utils";
import { useEffect, useState } from "react";

export type RecentRow = {
  key: string; title: string;
  statusName?: unknown;
  status: { name: string; color: string };
  priority: { name: string; color: string };
  typeIcon: string; typeName: string; projectKey: string;
  assignee?: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  updatedAt?: string;
};

export const cardTones = "rounded-xl border bg-card p-4 shadow-sm";
export const fmtDay = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const tooltipStyle = { backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

export function Card({ label, value, tone, href }: { label: string; value: number; tone?: "default" | "danger" | "warn" | "success"; href?: string }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "success" ? "text-success" : "";
  const inner = (
    <div className={cardTones}>
      <p className={"text-2xl font-bold tabular-nums " + cls}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">{inner}</Link>
  ) : inner;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold">{children}</h2>;
}

type ManagerDash = {
  view: "manager";
  cards: Record<string, number>;
  byStatus: { name: string; color: string; count: number }[];
  byPriority: { name: string; color: string; count: number }[];
  workload: { id: string; name: string; avatarUrl: string | null; open: number; done: number; overdue: number }[];
  trend: { day: string; created: number; completed: number }[];
  avgResolutionDays: number | null;
  recent: RecentRow[];
};

export default function ManagerDashboard() {
  const [d, setD] = useState<ManagerDash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ManagerDash>("/api/dashboard").then(setD).catch((e) => setError(e.message));
    const onTicket = () => api<ManagerDash>("/api/dashboard").then(setD).catch(() => {});
    window.addEventListener("strike:tickets-updated", onTicket);
    return () => window.removeEventListener("strike:tickets-updated", onTicket);
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!d) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-4 xl:grid-cols-7">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <div className="grid gap-4 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      </div>
    );
  }

  const c = d.cards;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Team Dashboard</h1>
        <p className="text-xs text-muted-foreground">Live overview of work across your team.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        <Card label="Open tickets" value={c.totalOpen ?? 0} href="/tickets" />
        <Card label="Unassigned" value={c.unassigned ?? 0} tone={c.unassigned > 0 ? "warn" : "default"} href="/available-work" />
        <Card label="Completed" value={c.completed ?? 0} tone="success" />
        <Card label="Overdue" value={c.overdue ?? 0} tone={(c.overdue ?? 0) > 0 ? "danger" : "default"} href="/tickets?overdue=true" />
        <Card label="High priority" value={c.highPriority ?? 0} tone={(c.highPriority ?? 0) > 0 ? "warn" : "default"} />
        <Card label="Due today" value={c.dueToday ?? 0} />
        <Card label="Avg resolution (days)" value={d.avgResolutionDays ?? 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={cardTones + " xl:col-span-2"}>
          <SectionTitle>Created vs completed - last 14 days</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.trend.map((t) => ({ ...t, dayLabel: fmtDay(t.day) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={26} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="created" name="Created" fill="#3f3f46" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completed" name="Completed" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={cardTones}>
          <SectionTitle>Status distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={d.byStatus.filter((s) => s.count > 0)} dataKey="count" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                {d.byStatus.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={cardTones}>
          <SectionTitle>Priority mix (open)</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={d.byPriority.filter((s) => s.count > 0)} dataKey="count" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                {d.byPriority.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={cardTones + " xl:col-span-2"}>
          <SectionTitle>Workload by employee</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.workload.map((w) => ({ name: w.name.split(" ")[0], open: w.open, done: w.done }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={26} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="open" name="Open" stackId="a" fill="#3f3f46" />
              <Bar dataKey="done" name="Completed" stackId="a" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ul className="mt-3 space-y-1.5">
            {d.workload.slice(0, 5).map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-xs">
                <Avatar user={{ id: w.id, firstName: w.name.split(" ")[0], lastName: w.name.split(" ")[1] ?? "", avatarUrl: w.avatarUrl }} size="sm" />
                <Link href={"/users/" + w.id} className="font-medium hover:underline">{w.name}</Link>
                <span className="ml-auto flex gap-3 tabular-nums text-muted-foreground">
                  <span>{w.open} open</span><span>{w.done} done</span>
                  {w.overdue > 0 && <span className="font-medium text-destructive">{w.overdue} overdue</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={cardTones}>
        <SectionTitle>Recently updated tickets</SectionTitle>
        <ul className="divide-y">
          {d.recent.map((t) => (
            <li key={t.key}>
              <Link href={"/tickets/" + t.key} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted/50">
                <TypeIcon name={t.typeName} size="sm" />
                <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">{t.projectKey}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <StatusBadge name={t.status.name} color={t.status.color} size="sm" />
                <PriorityBadge name={t.priority.name} color={t.priority.color} compact />
                <Avatar user={t.assignee} size="sm" />
                <span className="hidden w-16 shrink-0 text-right text-[11px] text-muted-foreground md:block">{t.updatedAt ? timeAgo(t.updatedAt) : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
