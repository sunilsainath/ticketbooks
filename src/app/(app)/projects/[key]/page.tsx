"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/client";
import { Skeleton, EmptyState } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, TypeIcon, DueBadge } from "@/components/tickets/badges";
import { dueLabel, timeAgo } from "@/lib/utils";

type Detail = {
  project: {
    id: string; key: string; name: string; description: string | null;
    lead: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
    team?: {
      id: string; name: string;
      manager?: { id: string; firstName: string; lastName: string } | null;
      members: { id: string; firstName: string; lastName: string; avatarUrl: string | null; jobTitle: string | null }[];
    } | null;
    sprints: { id: string; name: string; state: string; goal: string | null; startDate: string | null; endDate: string | null }[];
    labels: { id: string; name: string; color: string }[];
    totalTickets: number;
  };
  statusBreakdown: ({ id: string; name: string; color: string; count: number })[];
  priorityBreakdown: ({ id: string; name: string; color: string; count: number })[];
};

export default function ProjectOverviewPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>("/api/projects/" + key).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Failed"));
    (async () => {
      try {
        const m = await api<{ projects: { id: string; key: string }[] }>("/api/meta");
        const proj = m.projects.find((p) => p.key === key.toUpperCase());
        if (proj) {
          const d = await api<{ tickets: TicketRow[] }>("/api/tickets?projectId=" + proj.id + "&pageSize=8&sort=updated_desc");
          setTickets(d.tickets);
        } else setTickets([]);
      } catch {
        setTickets([]);
      }
    })();
  }, [key]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

  const p = data.project;
  const done = data.statusBreakdown.filter((s) => ["Done", "Closed", "Resolved"].includes(s.name)).reduce((a, s) => a + s.count, 0);

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/projects" className="hover:text-primary hover:underline">Projects</Link> / <span className="font-semibold text-foreground">{p.key}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">{p.key}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight">{p.name}</h1>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">{p.description ?? "No description."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div><p className="text-lg font-bold">{data.statusBreakdown.reduce((a, s) => a + s.count, 0)}</p><p className="text-muted-foreground">total tickets</p></div>
          <div><p className="text-lg font-bold text-success">{done}</p><p className="text-muted-foreground">completed</p></div>
          <div className="flex items-center gap-2"><Avatar user={p.lead} size="md" /><div><p className="font-semibold">{p.lead ? `${p.lead.firstName} ${p.lead.lastName}` : "-"}</p><p className="text-muted-foreground">Project lead</p></div></div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
          {!tickets ? <Skeleton className="h-40" /> : tickets.length === 0 ? (
            <EmptyState title="No tickets in this project yet" />
          ) : (
            <ul className="divide-y">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={"/tickets/" + t.key} className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
                    <TypeIcon name={t.type.name} size="sm" />
                    <span className="shrink-0 font-mono text-[11px] font-bold text-muted-foreground">{t.key}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                    <StatusBadge name={t.status.name} color={t.status.color} size="sm" />
                    <PriorityBadge name={t.priority.name} color={t.priority.color} compact />
                    <DueBadge {...dueLabel(t.dueDate)} />
                    <span className="hidden w-12 shrink-0 text-right text-[10px] text-muted-foreground md:block">{timeAgo(t.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={"/board?projectId=" + p.id} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Open board &rarr;</Link>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">By status</h2>
            <ul className="space-y-1.5">
              {data.statusBreakdown.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <StatusBadge name={s.name} color={s.color} size="sm" />
                  <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.count / Math.max(1, data.statusBreakdown.reduce((a, x) => a + x.count, 0))) * 100)}%`, backgroundColor: s.color }} />
                  </div>
                  <b className="w-6 text-right tabular-nums">{s.count}</b>
                </li>
              ))}
            </ul>
          </section>

          {p.team && (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Team - {p.team.name}{p.team.manager ? ` (led by ${p.team.manager.firstName} ${p.team.manager.lastName})` : ""}</h2>
              <ul className="space-y-1.5">
                {p.team.members.map((m) => (
                  <li key={m.id}>
                    <Link href={"/users/" + m.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted">
                      <Avatar user={m} size="xs" /> <span className="font-medium">{m.firstName} {m.lastName}</span>
                      {m.jobTitle && <span className="ml-auto text-muted-foreground">{m.jobTitle}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.labels.length > 0 && (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Labels</h2>
              <div className="flex flex-wrap gap-1.5">
                {p.labels.map((l) => (
                  <span key={l.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: l.color + "1c", color: l.color }}>{l.name}</span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

type TicketRow = {
  id: string; key: string; title: string;
  type: { name: string };
  status: { id: string; name: string; color: string };
  priority: { name: string; color: string };
  dueDate: string | null; updatedAt: string;
};
