"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable, type DragEndEvent } from "@dnd-kit/core";
import { api, ApiError } from "@/lib/client";
import { Select, Skeleton, EmptyState } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { PriorityBadge, DueBadge, TypeIcon, StatusBadge } from "@/components/tickets/badges";
import { useToast } from "@/components/providers";
import { cn, dueLabel } from "@/lib/utils";

type Row = {
  id: string; key: string; title: string;
  type: { id: string; name: string; icon: string };
  status: { id: string; name: string; color: string };
  priority: { id: string; name: string; color: string };
  sprint?: { id: string; name: string } | null;
  assignee: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  storyPoints: number | null; dueDate: string | null;
};
type Meta = {
  types: { id: string; name: string; icon: string }[];
  statuses: { id: string; name: string }[];
  priorities: { id: string; name: string }[];
  users: { id: string; firstName: string; lastName: string }[];
  sprints: { id: string; name: string; state: string; project?: { key: string } }[];
  projects: { id: string; key: string }[];
};

export default function BacklogPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <BacklogInner />
    </Suspense>
  );
}

function BacklogInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<{ id: string; key: string }[]>([]);
  const [projectId, setProjectId] = useState(params.get("projectId") ?? "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    api<Meta>("/api/meta").then((m) => {
      setMeta(m);
      setProjects(m.projects);
      setProjectId((cur) => cur || m.projects[0]?.id || "");
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const d = await api<{ tickets: Row[] }>("/api/tickets?projectId=" + projectId + "&pageSize=200&parentIdNull=true");
      setRows(d.tickets);
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Failed to load backlog", variant: "error" });
      setRows([]);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  const activeSprintId = meta?.sprints.find((s) => s.state === "ACTIVE")?.id ?? null;
  const activeSprintName = meta?.sprints.find((s) => s.id === activeSprintId)?.name ?? "Active Sprint";

  const inSprint = useMemo(
    () => (rows ?? []).filter((r) => r.sprint?.id && (!activeSprintId || r.sprint.id === activeSprintId)),
    [rows, activeSprintId]
  );
  const backlogItems = useMemo(() => (rows ?? []).filter((r) => !r.sprint), [rows]);

  const filteredBacklog = useMemo(() => {
    if (!backlogItems || !meta) return [];
    if (!typeFilter) return backlogItems;
    const t = meta.types.find((x) => x.id === typeFilter);
    return backlogItems.filter((r) => r.type.name === t?.name);
  }, [backlogItems, meta, typeFilter]);

  const grouped = useMemo(() => {
    const order = ["Epic", "Story", "Task", "Bug", "Improvement", "Feature", "Support", "Request"];
    const map = new Map<string, Row[]>();
    for (const r of filteredBacklog) {
      const list = map.get(r.type.name) ?? [];
      list.push(r);
      map.set(r.type.name, list);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filteredBacklog]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    const overId = e.over?.id as string | undefined;
    const row = rows?.find((r) => r.id === e.active.id);
    if (!overId || !row) return;
    try {
      if (overId === "sprint-col") {
        if (!activeSprintId) throw new ApiError("No active sprint for this project", 400);
        await api("/api/tickets/" + row.key, { method: "PATCH", json: { sprintId: activeSprintId } });
        toast({ title: row.key + " moved to " + activeSprintName });
      } else if (overId === "backlog-col") {
        await api("/api/tickets/" + row.key, { method: "PATCH", json: { sprintId: null } });
        toast({ title: row.key + " moved to backlog" });
      }
      await load();
      window.dispatchEvent(new CustomEvent("strike:tickets-updated"));
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : "Move failed", variant: "error" });
    }
  };

  const patchRow = async (rowKey: string, json: Record<string, unknown>) => {
    try {
      await api("/api/tickets/" + rowKey, { method: "PATCH", json });
      await load();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Update failed", variant: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Backlog</h1>
        <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); router.replace("/backlog?projectId=" + e.target.value); }} className="w-56" aria-label="Select project">
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.key}</option>)}
        </Select>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40" aria-label="Type filter">
          <option value="">All types</option>
          {meta?.types.filter((t) => !["Sub-task"].includes(t.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <span className="text-xs text-muted-foreground">Drag items between sprint and backlog</span>
      </div>

      {!meta || !rows ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <Skeleton className="h-[60vh]" /><Skeleton className="h-[60vh]" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={(e) => void onDragEnd(e)}>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[380px_1fr]">
            <section className="rounded-xl border bg-card shadow-sm">
              <header className="border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {activeSprintName}
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">{inSprint.length} tickets</span>
                </h2>
              </header>
              <SprintColumn tickets={inSprint} onPatch={patchRow} />
            </section>

            <section className="rounded-xl border bg-card shadow-sm">
              <header className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Backlog</h2>
              </header>
              <BacklogColumn groups={grouped} total={filteredBacklog.length} onPatch={patchRow} />
            </section>
          </div>
        </DndContext>
      )}
    </div>
  );
}

function SprintColumn({ tickets, onPatch }: { tickets: Row[]; onPatch: (k: string, j: Record<string, unknown>) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id: "sprint-col" });
  return (
    <div ref={setNodeRef} className={cn("min-h-[320px] space-y-1.5 p-3 transition-colors", isOver && "bg-accent ring-2 ring-inset ring-primary/40")}>
      {tickets.map((r) => <BacklogRow key={r.id} row={r} onPatch={onPatch} />)}
      {tickets.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">Drop tickets here to schedule them into the sprint.</p>}
    </div>
  );
}

function BacklogColumn({ groups, total, onPatch }: { groups: [string, Row[]][]; total: number; onPatch: (k: string, j: Record<string, unknown>) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id: "backlog-col" });
  return (
    <div ref={setNodeRef} className={cn("min-h-[320px] p-3 transition-colors", isOver && "bg-accent ring-2 ring-inset ring-primary/40")}>
      {total === 0 ? (
        <EmptyState title="Backlog is empty" description="Unscheduled tickets appear here. Drag from the sprint to move items back." />
      ) : (
        groups.map(([typeName, items]) => (
          <div key={typeName} className="mb-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <TypeIcon name={typeName} size="sm" /> {typeName} <span className="font-normal">({items.length})</span>
            </h3>
            <div className="space-y-1.5">
              {items.map((r) => <BacklogRow key={r.id} row={r} onPatch={onPatch} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function BacklogRow({ row, onPatch }: { row: Row; onPatch: (k: string, j: Record<string, unknown>) => Promise<void> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  const dl = dueLabel(row.dueDate);
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn("group flex cursor-grab touch-none select-none items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-sm shadow-sm hover:border-ring", isDragging && "opacity-40")}
      aria-label={"Ticket " + row.key}
    >
      <TypeIcon name={row.type.name} size="sm" />
      <Link href={"/tickets/" + row.key} onClick={(e) => e.stopPropagation()} tabIndex={-1} className="shrink-0 font-mono text-[11px] font-bold text-primary">{row.key.split("-").pop()}</Link>
      <Link href={"/tickets/" + row.key} onClick={(e) => e.stopPropagation()} tabIndex={-1} className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline">{row.title}</Link>
      <StatusBadge name={row.status.name} color={row.status.color} size="sm" />
      <button
        onClick={(e) => { e.stopPropagation(); void onPatch(row.key, { priorityId: undefined }); }}
        className="hidden"
        aria-hidden
      />
      <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <PriorityBadge name={row.priority.name} color={row.priority.color} compact />
      </span>
      <DueBadge {...dl} />
      {row.storyPoints != null && <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{row.storyPoints}</span>}
      <Avatar user={row.assignee} size="xs" />
    </div>
  );
}
