"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Hand, Inbox } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton, EmptyState } from "@/components/ui/field";
import { StatusBadge, PriorityBadge, DueBadge, TypeIcon, LabelChip, SlaBadge } from "@/components/tickets/badges";
import { useToast } from "@/components/providers";
import { dueLabel, timeAgo } from "@/lib/utils";

type Row = {
  id: string; key: string; title: string;
  projectKey: string;
  type: { name: string };
  status: { id: string; name: string; color: string };
  priority: { name: string; color: string };
  reporter?: { id: string; firstName: string; lastName: string } | null;
  labels: { id: string; name: string; color: string }[];
  storyPoints: number | null; dueDate: string | null;
  createdAt: string;
  sla?: { status: "breached" | "at_risk" | "on_track" | "met" | "none"; hoursOverdue: number | null; hoursLeft: number | null };
};

export default function AvailableWorkPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api<{ tickets: Row[] }>("/api/tickets?assigneeId=unassigned&pageSize=50&sort=priority_desc");
      setRows(d.tickets);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load available work");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const onTicket = () => void load();
    window.addEventListener("strike:tickets-updated", onTicket);
    return () => window.removeEventListener("strike:tickets-updated", onTicket);
  }, [load]);

  const claim = async (row: Row) => {
    setClaiming(row.id);
    try {
      await api("/api/tickets/" + row.key + "/claim", { method: "POST" });
      toast({ title: `You picked up ${row.key}`, description: "The ticket is now assigned to you. Your manager has been notified.", variant: "success" });
      setJustClaimed((prev) => [...prev, row.id]);
      window.dispatchEvent(new CustomEvent("strike:tickets-updated"));
    } catch (e) {
      toast({
        title: e instanceof ApiError ? e.message : "Could not claim ticket",
        description: e instanceof ApiError && e.status === 409 ? "Someone else claimed it first." : undefined,
        variant: "error",
      });
      await load();
    } finally {
      setClaiming(null);
    }
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Inbox className="h-5 w-5 text-primary" /> Available Work</h1>
        <p className="text-xs text-muted-foreground">Unassigned tickets ready to be picked up. First person to claim a ticket gets it.</p>
      </div>

      {!rows ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Nothing available right now"
          description="All open work is assigned. Check back later or ask your manager for more."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const claimedByMe = justClaimed.includes(r.id);
            const dl = dueLabel(r.dueDate);
            return (
              <article key={r.id} className={"flex flex-col rounded-xl border bg-card p-4 shadow-sm transition hover:border-ring " + (claimedByMe ? "border-success/50" : "")}>
                <div className="flex items-center gap-2">
                  <TypeIcon name={r.type.name} size="sm" />
                  <Link href={"/tickets/" + r.key} className="font-mono text-xs font-bold text-primary hover:underline">{r.key}</Link>
                  <span className="ml-auto"><PriorityBadge name={r.priority.name} color={r.priority.color} /></span>
                </div>
                <Link href={"/tickets/" + r.key} className="mt-1.5 line-clamp-2 flex-1 text-sm font-medium leading-snug hover:text-primary">
                  {r.title}
                </Link>
                {r.labels.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1">{r.labels.slice(0, 3).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}</span>
                )}
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    <StatusBadge name={r.status.name} color={r.status.color} size="sm" />
                    <SlaBadge sla={r.sla} size="sm" />
                    <DueBadge {...dl} />
                    {r.storyPoints != null && <span className="rounded-full bg-muted px-1.5 font-bold">{r.storyPoints} pts</span>}
                  </span>
                  {claimedByMe ? (
                    <Button size="sm" variant="success" disabled>Claimed by you</Button>
                  ) : (
                    <Button size="sm" onClick={() => void claim(r)} loading={claiming === r.id}>
                      <Hand className="h-3.5 w-3.5" /> Pick Ticket
                    </Button>
                  )}
                </div>
                {r.reporter && (
                  <p className="mt-2 truncate text-[10px] text-muted-foreground">Reported by {r.reporter.firstName} {r.reporter.lastName} · {timeAgo(r.createdAt)}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
