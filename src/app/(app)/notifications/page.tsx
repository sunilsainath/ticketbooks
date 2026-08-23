"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Skeleton, EmptyState } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
import { cn, timeAgo } from "@/lib/utils";

type Item = {
  id: string; title: string; body: string | null; type: string;
  readAt: string | null; createdAt: string;
  ticket?: { key: string; title: string } | null;
  actor?: { firstName: string; lastName: string } | null;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: Item[]; total: number }>("/api/notifications?page=" + page + (onlyUnread ? "&unread=true" : ""));
      setItems(d.items);
      setTotal(d.total);
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Failed to load", variant: "error" });
      setItems([]);
    }
  }, [page, onlyUnread, toast]);

  useEffect(() => { void load(); }, [load]);

  const markAll = async () => {
    await api("/api/notifications", { method: "POST", json: { action: "markAllRead" } });
    void load();
  };
  const markOne = async (id: string) => {
    await api(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
    void load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Notifications</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium">
            <input type="checkbox" checked={onlyUnread} onChange={() => { setOnlyUnread((v) => !v); setPage(1); }} className="accent-primary" />
            Unread only
          </label>
          <Button variant="secondary" size="sm" onClick={() => void markAll()}>Mark all read</Button>
        </div>
      </div>

      {!items ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell />} title={onlyUnread ? "No unread notifications" : "No notifications yet"} description="Ticket assignments, comments, mentions and status changes will appear here." />
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {items.map((n) => (
            <li key={n.id} className={cn("border-b last:border-0", !n.readAt && "bg-accent")}>
              <Link href={n.ticket ? "/tickets/" + n.ticket.key : "#"} className="flex gap-3 px-4 py-3 hover:bg-muted/60" onClick={() => !n.readAt && void markOne(n.id)}>
                <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (n.readAt ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    {n.type.replaceAll("_", " ").toLowerCase()} · {timeAgo(n.createdAt)}
                    {n.ticket ? ` · ${n.ticket.key}` : ""}
                  </span>
                </span>
                {!n.readAt && (
                  <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void markOne(n.id); }}>Mark read</Button>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items && total > 25 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
