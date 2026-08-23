"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, LogOut, Moon, Plus, Search, Sun, User as UserIcon, Settings as SettingsIcon, Monitor } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { useTheme } from "@/components/providers";
import { cn, timeAgo } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/session";
import { CommandPalette } from "@/components/layout/command-palette";
import CreateTicketModal from "@/components/tickets/create-modal";

type NotificationItem = {
  id: string; title: string; body: string | null; type: string;
  readAt: string | null; createdAt: string;
  ticket?: { key: string; title: string } | null;
  actor?: { firstName: string; lastName: string } | null;
};

export function Topbar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api<{ unreadNotifications: number }>("/api/auth/me").then((d) => setUnread(d.unreadNotifications)).catch(() => {});
  }, []);

  // Realtime notification push via SSE
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("notification", (evt) => {
      setUnread((u) => u + 1);
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        window.dispatchEvent(new CustomEvent("strike:toast", { detail: payload }));
      } catch {}
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-ring"
        aria-label="Global search"
      >
        <Search className="h-4 w-4" />
        <span>Search tickets...</span>
        <kbd className="ml-auto rounded border border-input bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => setCreateOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
        </button>

        <NotificationBell user={user} unread={unread} onRead={() => setUnread(0)} />

        <Dropdown
          trigger={
            <span aria-label={`Theme: ${theme}`} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            </span>
          }
        >
          {(close) => (
            <>
              <DropdownItem icon={<Sun />} onClick={() => { setTheme("light"); close(); }}>Light</DropdownItem>
              <DropdownItem icon={<Moon />} onClick={() => { setTheme("dark"); close(); }}>Dark</DropdownItem>
              <DropdownItem icon={<Monitor />} onClick={() => { setTheme("system"); close(); }}>System</DropdownItem>
            </>
          )}
        </Dropdown>

        <Dropdown
          trigger={
            <span className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-1 hover:bg-muted" aria-label="Account menu">
              <Avatar user={user} size="md" />
              <span className="hidden text-left md:block">
                <span className="block text-xs font-semibold leading-tight">{user.firstName} {user.lastName}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">{user.roleName}</span>
              </span>
            </span>
          }
        >
          {(close) => (
            <>
              <div className="px-3.5 py-2">
                <p className="text-[13px] font-semibold">{user.firstName} {user.lastName}</p>
                <p className="text-[11px] text-muted-foreground">{user.email}</p>
              </div>
              <DropdownSeparator />
              <Link href={`/users/${user.id}`}><DropdownItem icon={<UserIcon />} onClick={close}>Profile</DropdownItem></Link>
              <Link href="/settings"><DropdownItem icon={<SettingsIcon />} onClick={close}>Settings</DropdownItem></Link>
              <DropdownSeparator />
              <DropdownItem danger icon={<LogOut />} onClick={() => { close(); void logout(); }}>Log out</DropdownItem>
            </>
          )}
        </Dropdown>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {createOpen && (
        <CreateTicketModal
          onClose={(created) => {
            setCreateOpen(false);
            if (created) router.refresh();
          }}
        />
      )}
    </header>
  );
}

function NotificationBell({ unread, onRead }: { user: SessionUser; unread: number; onRead: () => void }) {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const d = await api<{ items: NotificationItem[] }>("/api/notifications?page=1");
    setItems(d.items);
  }, []);

  const openChange = () => {
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      void load();
    }
  };

  const markAll = async () => {
    await api("/api/notifications", { method: "POST", json: { action: "markAllRead" } });
    setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null);
    onRead();
  };

  return (
    <Dropdown trigger={
      <span className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </span>
    } width="w-80">
      {() => (
        <div onMouseDown={openChange}>
          <div className="flex items-center justify-between px-3.5 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
            <button onClick={markAll} className="text-[11px] font-medium text-primary hover:underline">Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto border-t">
            {!items ? (
              <div className="space-y-2 p-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />)}</div>
            ) : items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">You are all caught up.</p>
            ) : (
              items.slice(0, 8).map((n) => (
                <Link
                  key={n.id}
                  href={n.ticket ? `/tickets/${n.ticket.key}` : "/notifications"}
                  onClick={() => { if (!n.readAt) api(`/api/notifications/${n.id}/read`, { method: "PATCH" }).then(onRead).catch(() => {}); }}
                  className={cn("flex gap-2.5 border-b px-3.5 py-2.5 last:border-0 hover:bg-muted", !n.readAt && "bg-accent")}
                >
                  {!n.readAt && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success opacity-60" />}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{n.title}</p>
                    {n.body && <p className="truncate text-[11px] text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
          <Link href="/notifications" className="block border-t px-3.5 py-2 text-center text-[11px] font-medium text-primary hover:bg-muted">
            View all notifications
          </Link>
        </div>
      )}
    </Dropdown>
  );
}
