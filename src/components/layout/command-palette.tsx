"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Ticket as TicketIcon } from "lucide-react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge } from "@/components/tickets/badges";

type Hit = {
  id: string; key: string; title: string; projectKey: string;
  statusName: string; statusColor: string; priorityName: string; priorityColor: string; typeName: string;
  assignee?: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const d = await api<{ tickets: Hit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        setHits(d.tickets);
        setSelected(0);
      } catch {} finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const open = (key: string) => {
    onClose();
    router.push(`/tickets/${key}`);
  };

  // Portal to <body> so the sticky/blurred header cannot clip or trap the overlay
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-fade-in w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-2xl" role="dialog" aria-label="Global search">
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && hits[selected]) open(hits[selected].key);
            }}
            placeholder="Search by key, title or description... e.g. WEB-1002"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-input bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {q && !loading && hits.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No tickets match &ldquo;{q}&rdquo;</p>
          )}
          {hits.map((t, i) => (
            <button
              key={t.id}
              onMouseEnter={() => setSelected(i)}
              onClick={() => open(t.key)}
              className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-0 ${i === selected ? "bg-accent" : ""}`}
            >
              <TicketIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{t.key}</span>
                  <span className="truncate text-sm">{t.title}</span>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <StatusBadge name={t.statusName} color={t.statusColor} size="sm" />
                  <PriorityBadge name={t.priorityName} color={t.priorityColor} compact />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.projectKey}</span>
                </span>
              </span>
              <Avatar user={t.assignee} size="sm" />
              {i === selected && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
        <div className="border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <kbd className="rounded border border-input bg-muted px-1">↑↓</kbd> navigate &nbsp;·&nbsp;
          <kbd className="rounded border border-input bg-muted px-1">Enter</kbd> open ticket
        </div>
      </div>
    </div>,
    document.body
  );
}
