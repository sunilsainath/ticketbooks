"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, ChevronLeft, ChevronRight, Trash2, UserPlus, Flag } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Input, Select, Skeleton, EmptyState } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, TypeIcon, DueBadge, LabelChip, SlaBadge } from "@/components/tickets/badges";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";
import { cn, dueLabel, timeAgo } from "@/lib/utils";

type TicketRow = {
  id: string; key: string; title: string;
  projectKey: string; projectName: string;
  type: { id: string; name: string; icon: string };
  status: { id: string; name: string; color: string; category: string };
  priority: { id: string; name: string; color: string };
  assignee: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  labels: { id: string; name: string; color: string }[];
  storyPoints: number | null; dueDate: string | null;
  commentCount: number; updatedAt: string;
  sla?: { status: "breached" | "at_risk" | "on_track" | "met" | "none"; hoursOverdue: number | null; hoursLeft: number | null };
};
type Meta = {
  statuses: { id: string; name: string }[];
  priorities: { id: string; name: string; order: number }[];
  projects: { id: string; key: string; name: string }[];
  users: { id: string; firstName: string; lastName: string }[];
};

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>}>
      <TicketsInner />
    </Suspense>
  );
}

function TicketsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<{ id: string; permissions: string[] } | null>(null);

  // filters
  const [q, setQ] = useState(params.get("q") ?? "");
  const projectId = params.get("projectId") ?? "";
  const statusIds = params.get("statusIds") ?? "";
  const priorityIds = params.get("priorityIds") ?? "";
  const assigneeId = params.get("assigneeId") ?? "";
  const overdue = params.get("overdue") === "true";
  const sla = params.get("sla") ?? "";
  const sort = params.get("sort") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Meta>("/api/meta").then(setMeta).catch(() => {});
    api<{ user: { id: string; permissions: string[] } }>("/api/auth/me").then((d) => setMe(d.user)).catch(() => {});
  }, []);

  const fetchRows = useCallback(async () => {
    setRows(null);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (projectId) sp.set("projectId", projectId);
    if (statusIds) sp.set("statusIds", statusIds);
    if (priorityIds) sp.set("priorityIds", priorityIds);
    if (assigneeId) sp.set("assigneeId", assigneeId);
    if (overdue) sp.set("overdue", "true");
    if (sla && sla !== "any") sp.set("sla", sla);
    if (sort) sp.set("sort", sort);
    if (page > 1) sp.set("page", String(page));
    sp.set("pageSize", "25");
    try {
      const d = await api<{ tickets: TicketRow[]; total: number; pages: number }>("/api/tickets?" + sp.toString());
      setRows(d.tickets);
      setTotal(d.total);
      setPages(d.pages);
      setSelected(new Set());
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Failed to load tickets", variant: "error" });
      setRows([]);
    }
  }, [q, projectId, statusIds, priorityIds, assigneeId, overdue, sla, sort, page, toast]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const setParam = (k: string, v: string) => {
    const sp = new URLSearchParams(params.toString());
    if (v) sp.set(k, v); else sp.delete(k);
    if (k !== "page") sp.delete("page");
    router.replace(`/tickets?${sp.toString()}`);
  };

  const canManage = Boolean(me && (me.permissions.includes("*") || me.permissions.includes("ticket.assign")));
  const canDelete = Boolean(me && (me.permissions.includes("*") || me.permissions.includes("ticket.delete.team")));

  const allSelected = rows !== null && rows.length > 0 && rows.every((r) => selected.has(r.id));

  const runBulk = async (action: string, value: string | null) => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await api<{ updated: number; failed: { key: string; error: string }[] }>("/api/bulk", {
        method: "PATCH",
        json: { keys: [...selected], action, value },
      });
      toast({ title: `Updated ${res.updated} ticket${res.updated === 1 ? "" : "s"}`, variant: "success" });
      if (res.failed.length) toast({ title: `${res.failed.length} failed`, description: res.failed[0].error, variant: "error" });
      await fetchRows();
      window.dispatchEvent(new CustomEvent("strike:tickets-updated"));
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Bulk update failed", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Tickets</h1>
        <span className="text-xs text-muted-foreground">{total} results</span>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); }}
            onKeyDown={(e) => e.key === "Enter" && setParam("q", q)}
            placeholder="Search title / key..."
            className="w-56"
            aria-label="Search tickets"
          />
          <Button variant="secondary" onClick={() => setParam("q", q)}><Filter className="h-3.5 w-3.5" /> Search</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
        <Select value={projectId} onChange={(e) => setParam("projectId", e.target.value)} className="w-40" aria-label="Project filter">
          <option value="">All projects</option>
          {meta?.projects.map((p) => <option key={p.id} value={p.id}>{p.key}</option>)}
        </Select>
        <Select value={statusIds} onChange={(e) => setParam("statusIds", e.target.value)} className="w-36" aria-label="Status filter">
          <option value="">All statuses</option>
          {meta?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={priorityIds} onChange={(e) => setParam("priorityIds", e.target.value)} className="w-36" aria-label="Priority filter">
          <option value="">All priorities</option>
          {meta?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={assigneeId} onChange={(e) => setParam("assigneeId", e.target.value)} className="w-44" aria-label="Assignee filter">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {meta?.users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </Select>
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
          <input type="checkbox" checked={overdue} onChange={() => setParam("overdue", overdue ? "" : "true")} className="accent-primary" />
          Overdue only
        </label>
        <Select value={sla} onChange={(e) => setParam("sla", e.target.value)} className="w-40" aria-label="SLA filter">
          <option value="">Any SLA</option>
          <option value="breached">SLA breached</option>
          <option value="at_risk">At risk (&lt;24h)</option>
          <option value="on_track">On track</option>
          <option value="met">Met (done)</option>
        </Select>
        <Select value={sort} onChange={(e) => setParam("sort", e.target.value)} className="ml-auto w-44" aria-label="Sort">
          <option value="">Newest first</option>
          <option value="updated_desc">Recently updated</option>
          <option value="due_asc">Due date</option>
          <option value="priority_desc">Priority high-low</option>
          <option value="priority_asc">Priority low-high</option>
          <option value="key_asc">Ticket key</option>
        </Select>
      </div>

      {/* Bulk action bar */}
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-accent p-2.5 animate-fade-in">
          <span className="px-1 text-xs font-semibold">{selected.size} selected</span>
          <Select value={bulkStatus} onChange={(e) => { const v = e.target.value; if (!v) return; setBulkStatus(""); void runBulk("status", v); }} className="w-36 h-8" aria-label="Bulk change status">
            <option value="">Set status...</option>
            {meta?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={bulkPriority} onChange={(e) => { const v = e.target.value; if (!v) return; setBulkPriority(""); void runBulk("priority", v); }} className="w-36 h-8" aria-label="Bulk change priority">
            <option value=""><Flag className="inline h-3 w-3" /> Set priority...</option>
            {meta?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={bulkAssignee} onChange={(e) => { const v = e.target.value; if (v === "__none__") return; setBulkAssignee(""); void runBulk("assign", v === "__un__" ? null : v); }} className="w-44 h-8" aria-label="Bulk reassign">
            <option value="__none__">Reassign...</option>
            <option value="__un__">Unassign</option>
            {meta?.users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </Select>
          {canDelete && (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Archive
            </Button>
          )}
        </div>
      )}

      {!rows ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Filter />} title="No tickets match these filters" description="Try clearing filters or searching for something else." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => {
                        const next = new Set<string>();
                        if (!allSelected) rows.forEach((r) => next.add(r.id));
                        setSelected(next);
                      }}
                      className="accent-primary"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="py-2.5 pr-3 font-medium">Key</th>
                  <th className="py-2.5 pr-3 font-medium">Summary</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-3 font-medium">Priority</th>
                  <th className="py-2.5 pr-3 font-medium">Assignee</th>
                  <th className="py-2.5 pr-3 font-medium">Labels</th>
                  <th className="py-2.5 pr-3 font-medium">Due</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((t) => (
                  <tr key={t.id} className={cn("group transition-colors hover:bg-muted/50", selected.has(t.id) && "bg-accent")}>
                    <td className="px-3">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                        className="accent-primary"
                        aria-label={"Select " + t.key}
                      />
                    </td>
                    <td className="py-2.5 pr-3"><TypeIcon name={t.type.name} size="sm" /> <Link href={"/tickets/" + t.key} className="font-mono text-xs font-semibold text-muted-foreground hover:text-primary hover:underline">{t.projectKey}-{t.key.split("-").pop()}</Link></td>
                    <td className="max-w-[340px] truncate py-2.5 pr-3">
                      <Link href={"/tickets/" + t.key} className="font-medium hover:text-primary hover:underline">{t.title}</Link>
                      <span className="ml-2 text-[11px] text-muted-foreground">{t.commentCount > 0 ? "(" + t.commentCount + ")" : ""}</span>
                    </td>
                    <td className="py-2.5 pr-3"><StatusBadge name={t.status.name} color={t.status.color} size="sm" /></td>
                    <td className="py-2.5 pr-3"><PriorityBadge name={t.priority.name} color={t.priority.color} /></td>
                    <td className="py-2.5 pr-3">
                      {t.assignee ? (
                        <span className="flex items-center gap-1.5"><Avatar user={t.assignee} size="xs" /><span className="whitespace-nowrap text-xs">{t.assignee.firstName} {t.assignee.lastName}</span></span>
                      ) : (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3"><span className="flex max-w-[140px] flex-wrap gap-1 overflow-hidden">{t.labels.slice(0, 2).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}</span></td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <SlaBadge sla={t.sla} size="sm" />
                        <DueBadge {...dueLabel(t.dueDate)} />
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[11px] text-muted-foreground">{timeAgo(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}><ChevronLeft className="h-3.5 w-3.5" /> Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void runBulk("delete", null)}
        title={"Archive " + selected.size + " tickets?"}
        message="Archived tickets are hidden from lists but preserved for audit purposes."
        confirmLabel="Archive"
        danger
      />
    </div>
  );
}
