"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Inbox, Clock, CalendarClock, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { Skeleton, EmptyState } from "@/components/ui/field";
import { StatusBadge, PriorityBadge, TypeIcon } from "@/components/tickets/badges";
import { timeAgo } from "@/lib/utils";
import { Card, SectionTitle, cardTones } from "./manager-dashboard";

type Row = {
  key: string; title: string;
  status: { name: string; color: string };
  priority: { name: string; color: string };
  typeIcon: string; typeName: string; projectKey: string;
  createdAt?: string; updatedAt?: string;
};

type EmployeeDash = {
  view: "employee";
  cards: Record<string, number>;
  recentlyAssigned: Row[];
  recentlyUpdated: Row[];
};

export default function EmployeeDashboard() {
  const [d, setD] = useState<EmployeeDash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<EmployeeDash>("/api/dashboard").then(setD).catch((e) => setError(e.message));
    const onTicket = () => api<EmployeeDash>("/api/dashboard").then(setD).catch(() => {});
    window.addEventListener("strike:tickets-updated", onTicket);
    return () => window.removeEventListener("strike:tickets-updated", onTicket);
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!d) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }

  const c = d.cards;

  const TicketList = ({ rows, empty }: { rows: Row[]; empty: string }) =>
    rows.length === 0 ? (
      <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>
    ) : (
      <ul className="divide-y">
        {rows.map((t) => (
          <li key={t.key}>
            <Link href={"/tickets/" + t.key} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted/50">
              <TypeIcon name={t.typeName} size="sm" />
              <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">{t.projectKey}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
              <StatusBadge name={t.status.name} color={t.status.color} size="sm" />
              <PriorityBadge name={t.priority.name} color={t.priority.color} compact />
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">My Dashboard</h1>
        <p className="text-xs text-muted-foreground">Your work at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Card label="My open tickets" value={c.myOpen ?? 0} href="/my-work" />
        <Card label="Overdue" value={c.myOverdue ?? 0} tone={(c.myOverdue ?? 0) > 0 ? "danger" : "default"} href="/tickets?overdue=true&assigneeId=me" />
        <Card label="Due today" value={c.myDueToday ?? 0} />
        <Card label="High priority" value={c.myHighPriority ?? 0} tone={(c.myHighPriority ?? 0) > 0 ? "warn" : "default"} />
        <Card label="Completed" value={c.myCompleted ?? 0} tone="success" href="/my-work?tab=completed" />
        <Card label="Available to pick up" value={c.availableWork ?? 0} href="/available-work" />
      </div>

      {c.availableWork > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-sm">
          <Inbox className="h-4 w-4 text-primary" />
          <span>
            There {c.availableWork === 1 ? "is" : "are"} <b>{c.availableWork}</b> unassigned ticket{c.availableWork === 1 ? "" : "s"} available in your team.
          </span>
          <Link href="/available-work" className="ml-auto shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary/90">
            Browse Available Work
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cardTones}>
          <SectionTitle>Recently assigned to me</SectionTitle>
          <TicketList rows={d.recentlyAssigned} empty="Nothing newly assigned. Browse Available Work to pick something up." />
        </div>
        <div className={cardTones}>
          <SectionTitle>Recently updated</SectionTitle>
          <TicketList rows={d.recentlyUpdated} empty="No recent activity." />
        </div>
      </div>
    </div>
  );
}
