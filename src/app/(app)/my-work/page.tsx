"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BellRing, Eye, CheckCircle2, UserCheck, PenSquare, History } from "lucide-react";
import { api } from "@/lib/client";
import { Skeleton, EmptyState, Select } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, TypeIcon, DueBadge } from "@/components/tickets/badges";
import { cn, dueLabel, timeAgo } from "@/lib/utils";

type Row = {
  id: string; key: string; title: string; projectKey: string;
  type: { name: string; icon: string };
  status: { id: string; name: string; color: string };
  priority: { name: string; color: string };
  assignee: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  storyPoints: number | null; dueDate: string | null; updatedAt: string;
};

const TABS = [
  { key: "assigned", label: "Assigned to Me", icon: UserCheck },
  { key: "created", label: "Created by Me", icon: PenSquare },
  { key: "watching", label: "Watching", icon: Eye },
  { key: "mentioned", label: "Mentioned", icon: BellRing },
  { key: "viewed", label: "Recently Viewed", icon: History },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
] as const;

export default function MyWorkPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <MyWorkInner />
    </Suspense>
  );
}

function MyWorkInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<string>(params.get("tab") ?? "assigned");
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [statuses, setStatuses] = useState<{ id: string; name: string }[]>([]);
  const [mentions, setMentions] = useState<{ id: string; title: string; body: string | null; createdAt: string; ticket?: { key: string; title: string } | null }[] | null>(null);
  const [viewed, setViewed] = useState<Row[] | null>(null);

  useEffect(() => {
    api<{ statuses: { id: string; name: string }[] }>("/api/meta").then((m) => setStatuses(m.statuses)).catch(() => {});
  }, []);

  const doneStatusIds = statuses.filter((s) => ["Done", "Closed", "Resolved"].includes(s.name)).map((s) => s.id);

  const load = useCallback(async () => {
    if (!tab) return;
    if (tab === "mentioned" || tab === "viewed") return;
    setRows(null);
    let qs = "pageSize=100&sort=updated_desc";
    if (tab === "assigned") qs += "&assigneeId=me&parentIdNull=false" + (statusFilter ? "&statusIds=" + statusFilter : "");
    else if (tab === "created") qs += "&reporterId=me";
    else if (tab === "watching") qs = "watchedByMe=true&pageSize=100&sort=updated_desc";
    else if (tab === "completed") qs += "&assigneeId=me" + (doneStatusIds.length ? "&statusIds=" + doneStatusIds.join(",") : "");
    try {
      const d = await api<{ tickets: Row[] }>("/api/tickets?" + qs);
      setRows(d.tickets);
    } catch {
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter, JSON.stringify(doneStatusIds)]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab !== "mentioned") return;
    api<{ items: NonNullable<typeof mentions> }>("/api/notifications?page=1")
      .then((d) => setMentions(d.items.filter((i) => i.title?.toLowerCase().includes("mention"))))
      .catch(() => setMentions([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== "viewed") return;
    const keys = (() => {
      try { return JSON.parse(localStorage.getItem("strike-recent-tickets") ?? "[]") as string[]; } catch { return []; }
    })();
    Promise.all(keys.map((k) => api<{ ticket: Row }>("/api/tickets/" + k).catch(() => null)))
      .then((results) => setViewed(results.filter(Boolean).map((r) => r!.ticket)));
  }, [tab]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold tracking-tight">My Work</h1>

      <div role="tablist" aria-label="My work tabs" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => { setTab(key); setStatusFilter(""); }}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              tab === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {(tab === "assigned") && (
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44" aria-label="Status filter">
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      )}

      {tab === "mentioned" ? (
        !mentions ? <SkeletonList /> : mentions.length === 0
          ? <EmptyState title="No mentions yet" description="When someone @mentions you in a comment it will appear here." />
          : (
            <ul className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {mentions.map((n) => (
                <li key={n.id}>
                  <Link href={n.ticket ? "/tickets/" + n.ticket.key : "#"} className="block border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/50">
                    <p className="font-medium">{n.ticket?.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )
      ) : tab === "viewed" ? (
        !viewed ? <SkeletonList /> : viewed.length === 0
          ? <EmptyState title="No recently viewed tickets" description="Tickets you open will be listed here." />
          : <ul className="overflow-hidden rounded-xl border bg-card shadow-sm">{viewed.map((t) => <TicketLine key={t.key} t={t} />)}</ul>
      ) : !rows ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing here yet" description="When tickets match this view they will appear here." />
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {rows.map((t) => <TicketLine key={t.id} t={t} />)}
        </ul>
      )}
    </div>
  );
}

function SkeletonList() {
  return <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;
}

function TicketLine({ t }: { t: Row }) {
  const dl = dueLabel(t.dueDate);
  return (
    <li className="border-b last:border-0">
      <Link href={"/tickets/" + t.key} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
        onClick={() => {
          try {
            const cur = JSON.parse(localStorage.getItem("strike-recent-tickets") ?? "[]") as string[];
            localStorage.setItem("strike-recent-tickets", JSON.stringify([t.key, ...cur.filter((k) => k !== t.key)].slice(0, 10)));
          } catch {}
        }}
      >
        <TypeIcon name={t.type.name} size="sm" />
        <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground">{t.projectKey}-{t.key.split("-").pop()}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
        <StatusBadge name={t.status.name} color={t.status.color} size="sm" />
        <PriorityBadge name={t.priority.name} color={t.priority.color} compact />
        <DueBadge {...dl} />
        {t.storyPoints != null && <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{t.storyPoints}</span>}
        <Avatar user={t.assignee} size="xs" />
        <span className="hidden w-14 shrink-0 text-right text-[10px] text-muted-foreground md:block">{timeAgo(t.updatedAt)}</span>
      </Link>
    </li>
  );
}
