"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { api, ApiError } from "@/lib/client";
import { Select, Skeleton } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { PriorityBadge, DueBadge, LabelChip, SlaBadge } from "@/components/tickets/badges";
import { useToast } from "@/components/providers";
import { cn, dueLabel } from "@/lib/utils";

type Card = {
  id: string; key: string; title: string;
  status: { id: string; name: string };
  priority: { id: string; name: string; color: string };
  assignee: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  labels: { id: string; name: string; color: string }[];
  storyPoints: number | null; dueDate: string | null;
  sla?: { status: "breached" | "at_risk" | "on_track" | "met" | "none"; hoursOverdue: number | null; hoursLeft: number | null };
};
type Status = { id: string; name: string; color: string; category: string; order: number };

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="flex gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-[60vh] w-72 animate-pulse rounded-xl bg-muted" />)}</div>}>
      <BoardInner />
    </Suspense>
  );
}

function BoardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<{ id: string; key: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState(params.get("projectId") ?? "");
  const [statuses, setStatuses] = useState<Status[] | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);

  useEffect(() => {
    api<{ statuses: Status[]; projects: { id: string; key: string; name: string }[] }>("/api/meta").then((m) => {
      setStatuses([...m.statuses].sort((a, b) => a.order - b.order));
      setProjects(m.projects);
      setProjectId((cur) => cur || m.projects[0]?.id || "");
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const d = await api<{ tickets: Card[] }>("/api/tickets?projectId=" + projectId + "&pageSize=200&parentIdNull=true");
      setCards(d.tickets);
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Failed to load board", variant: "error" });
      setCards([]);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = (e: DragStartEvent) => {
    setDragging(cards?.find((c) => c.id === e.active.id) ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const overId = e.over?.id as string | undefined;
    const activeId = e.active.id as string;
    if (!overId || !cards) return;

    const card = cards.find((c) => c.id === activeId);
    const targetStatus = statuses?.find((s) => s.id === overId);
    if (!card || !targetStatus || card.status.id === targetStatus.id) return;

    const prev = cards;
    setCards(cards.map((c) => (c.id === activeId ? { ...c, status: { id: targetStatus.id, name: targetStatus.name } } : c)));
    try {
      await api("/api/tickets/" + activeId, { method: "PATCH", json: { statusId: targetStatus.id } });
      window.dispatchEvent(new CustomEvent("strike:tickets-updated"));
      toast({ title: card.key + " moved to " + targetStatus.name });
    } catch (err) {
      setCards(prev);
      toast({ title: err instanceof ApiError ? err.message : "Could not move ticket", variant: "error" });
    }
  };

  const byStatus = useMemo(() => {
    const map = new Map<string, Card[]>();
    statuses?.forEach((s) => map.set(s.id, []));
    cards?.forEach((c) => map.get(c.status.id)?.push(c));
    return map;
  }, [statuses, cards]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Kanban Board</h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">Drag cards between columns to update status</span>
        <Select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            router.replace("/board?projectId=" + e.target.value);
          }}
          className="ml-auto w-56"
          aria-label="Select project"
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.key} - {p.name}</option>)}
        </Select>
      </div>

      {!statuses || !cards ? (
        <div className="flex gap-4 overflow-hidden">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[60vh] w-72 shrink-0" />)}</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={(e) => void onDragEnd(e)}>
          <div className="flex gap-4 overflow-x-auto pb-3">
            {statuses.map((s) => (
              <Column key={s.id} status={s} cards={byStatus.get(s.id) ?? []} />
            ))}
          </div>
          <DragOverlay>
            {dragging ? (
              <div className="w-64 rotate-2 cursor-grabbing rounded-xl border bg-card p-3 shadow-2xl">
                <p className="font-mono text-[10px] font-bold text-primary">{dragging.key}</p>
                <p className="mt-0.5 line-clamp-3 text-xs font-medium">{dragging.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ status, cards }: { status: Status; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30" aria-label={status.name + " column"}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
        <h2 className="text-xs font-semibold uppercase tracking-wide">{status.name}</h2>
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{cards.length}</span>
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-[120px] flex-1 flex-col gap-2 rounded-b-xl p-2 transition-colors", isOver && "bg-accent ring-2 ring-inset ring-primary/40")}>
        {cards.map((c) => <TicketCard key={c.id} card={c} />)}
        {cards.length === 0 && <p className="py-8 text-center text-[11px] text-muted-foreground">Drop tickets here</p>}
      </div>
    </section>
  );
}

function TicketCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const dl = dueLabel(card.dueDate);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab touch-none select-none rounded-lg border bg-card p-2.5 shadow-sm transition hover:border-ring", isDragging && "opacity-40")}
      role="button"
      aria-label={"Ticket " + card.key + ": " + card.title}
    >
      <Link href={"/tickets/" + card.key} onClick={(e) => e.stopPropagation()} tabIndex={-1} className="block">
        <span className="font-mono text-[10px] font-bold text-primary">{card.key}</span>
        <span className="mt-0.5 line-clamp-3 block text-xs font-medium leading-snug">{card.title}</span>
        {card.labels.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {card.labels.slice(0, 3).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
          </span>
        )}
        {(card.sla?.status === "breached" || card.sla?.status === "at_risk") && (
          <span className="mt-1.5"><SlaBadge sla={card.sla} size="sm" /></span>
        )}
        <span className="mt-2 flex items-center justify-between">
          <PriorityBadge name={card.priority.name} color={card.priority.color} compact />
          <span className="flex items-center gap-2">
            {card.storyPoints != null && <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{card.storyPoints}</span>}
            <DueBadge {...dl} />
            <Avatar user={card.assignee} size="xs" />
          </span>
        </span>
      </Link>
    </div>
  );
}
