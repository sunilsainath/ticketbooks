"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { api } from "@/lib/client";
import { Input, Skeleton, EmptyState, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Log = {
  id: string; action: string; entityType: string; entityId: string | null;
  ip: string | null; metadata: Record<string, unknown> | null; createdAt: string;
  user?: { firstName: string; lastName: string; email: string } | null;
};

const ACTIONS = ["", "LOGIN", "LOGIN_FAILED", "LOGOUT", "USER_CREATED", "USER_UPDATED", "USER_DELETED", "USER_DISABLED", "TEAM_CREATED", "TEAM_UPDATED", "PROJECT_CREATED", "TICKET_ARCHIVED", "BULK_UPDATE", "SETTINGS_UPDATED", "PASSWORD_RESET", "PASSWORD_CHANGED"];

export default function AuditLogsPage() {
  const [items, setItems] = useState<Log[] | null>(null);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const sp = new URLSearchParams({ page: String(page) });
      if (q.trim()) sp.set("q", q.trim());
      if (action) sp.set("action", action);
      const d = await api<{ items: Log[]; hasMore: boolean }>("/api/audit?" + sp.toString());
      setItems(d.items);
      setHasMore(d.hasMore);
    } catch {
      setItems([]);
    }
  }, [page, q, action]);

  useEffect(() => { void load(); }, [load]);

  const fmtMeta = (meta: Record<string, unknown> | null): string => {
    if (!meta) return "";
    return Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight"><ScrollText className="h-5 w-5 text-primary" /> Audit Logs</h1>
        <span className="text-xs text-muted-foreground">Immutable security &amp; activity trail</span>
        <div className="ml-auto flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="Search user or entity..." className="w-56" aria-label="Search audit logs" />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-44" aria-label="Filter action">
            {ACTIONS.map((a) => <option key={a} value={a}>{a || "All actions"}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => { setPage(1); void load(); }}><Search className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {!items ? (
        <div className="space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No audit entries match" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="py-2.5 pr-4 font-medium">User</th>
                <th className="py-2.5 pr-4 font-medium">Action</th>
                <th className="py-2.5 pr-4 font-medium">Entity</th>
                <th className="py-2.5 pr-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono text-xs">
              {items.map((l) => (
                <tr key={l.id} className="hover:bg-muted/50">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">{l.user ? `${l.user.firstName} ${l.user.lastName}` : "System"}</td>
                  <td className="py-2 pr-4"><span className={"rounded px-1.5 py-0.5 font-semibold " + (l.action.includes("FAILED") || l.action.includes("DELETED") ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>{l.action}</span></td>
                  <td className="py-2 pr-4">{l.entityType}</td>
                  <td className="max-w-[280px] truncate py-2 pr-4 text-muted-foreground">{fmtMeta(l.metadata)}{l.ip ? ` · ip: ${l.ip}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}
