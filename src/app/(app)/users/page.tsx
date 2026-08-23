"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Input, Select, Skeleton, EmptyState, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { MoreHorizontal } from "lucide-react";
import { useToast } from "@/components/providers";
import { timeAgo } from "@/lib/utils";

type UserRow = {
  id: string; firstName: string; lastName: string; email: string; jobTitle?: string | null;
  status: string; lastLoginAt: string | null;
  role: { id: string; name: string };
  team: { id: string; name: string } | null;
  openTickets: number; completedTickets: number;
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    void load();
    api<{ teams: { id: string; name: string }[] }>("/api/teams").then((d) => setTeams(d.teams)).catch(() => {});
    api<{ user: { permissions: string[] } }>("/api/auth/me").then((d) => {
      setCanManage(d.user.permissions.includes("*") || d.user.permissions.includes("user.manage"));
      if (d.user.permissions.includes("*") || d.user.permissions.includes("user.manage")) {
        api<{ roles: { id: string; name: string }[] }>("/api/roles").then((r) => setRoles(r.roles)).catch(() => {});
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const d = await api<{ users: UserRow[] }>("/api/users?" + new URLSearchParams({ ...(q ? { q } : {}), ...(teamFilter ? { teamId: teamFilter } : {}) }));
      setRows(d.users);
    } catch (e) {
      setRows([]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Users</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="Search name or email..." className="w-56" aria-label="Search users" />
          <Select value={teamFilter} onChange={(e) => { setTeamFilter(e.target.value); }} className="w-40">
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => void load()}><Search className="h-3.5 w-3.5" /></Button>
          {canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create user</Button>}
        </div>
      </div>

      {!rows ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="py-2.5 pr-4 font-medium">Role</th>
                <th className="py-2.5 pr-4 font-medium">Team</th>
                <th className="py-2.5 pr-4 font-medium">Status</th>
                <th className="py-2.5 pr-4 font-medium">Open</th>
                <th className="py-2.5 pr-4 font-medium">Completed</th>
                <th className="py-2.5 pr-4 font-medium">Last login</th>
                <th className="py-2.5 pr-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-muted/50">
                  <td className="px-4 py-2.5">
                    <Link href={"/users/" + u.id} className="flex items-center gap-2.5 hover:text-primary">
                      <Avatar user={u} size="sm" />
                      <span>
                        <span className="block font-medium">{u.firstName} {u.lastName}</span>
                        <span className="block text-[11px] text-muted-foreground">{u.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4"><Badge>{u.role.name}</Badge></td>
                  <td className="py-2.5 pr-4 text-xs">{u.team?.name ?? "-"}</td>
                  <td className="py-2.5 pr-4"><StatusPill status={u.status} /></td>
                  <td className="py-2.5 pr-4 tabular-nums">{u.openTickets}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{u.completedTickets}</td>
                  <td className="py-2.5 pr-4 text-xs text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                  <td className="py-2.5 pr-2 text-right">
                    {canManage && <UserActions user={u} onChanged={() => void load()} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create user" description="An activation email with sign-in instructions can be sent automatically." width="max-w-xl">
        <CreateUserForm teams={teams} onDone={(okMsg) => { if (okMsg) { setCreateOpen(false); void load(); } }} />
      </Dialog>
    </div>
  );
}

function SkeletonList() {
  return <div className="space-y-2">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium">{children}</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-success/10 text-success",
    INVITED: "bg-warning/10 text-warning",
    DISABLED: "bg-destructive/10 text-destructive",
  };
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (map[status] ?? "")}>{status}</span>;
}

function UserActions({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const act = async (json: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const res = await api<{ tempPassword?: string }>("/api/users/" + user.id, { method: "PATCH", json });
      toast({
        title: msg,
        description: res.tempPassword ? `Temporary password: ${res.tempPassword}` : undefined,
        variant: "success",
      });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Action failed", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <Dropdown trigger={<MoreHorizontal className="mx-auto h-4 w-4 text-muted-foreground hover:text-foreground" />}>
      {(close) => (
        <>
          <DropdownItem onClick={() => { close(); void act(user.status === "DISABLED" ? { status: "ACTIVE" } : { status: "DISABLED" }, user.status === "DISABLED" ? "User enabled" : "User disabled"); }}>
            {user.status === "DISABLED" ? "Enable user" : "Disable user"}
          </DropdownItem>
          <DropdownItem onClick={() => { close(); void act({ resetPassword: true }, "Password reset"); }}>Reset password</DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

function CreateUserForm({ teams, onDone }: { teams: { id: string; name: string }[]; onDone: (done: boolean) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", roleId: "", teamId: "", jobTitle: "", phone: "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, sendInviteEmail: true });
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api<{ roles: { id: string; name: string }[] }>("/api/roles").then((r) => setRoles(r.roles)).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api<{ tempPassword?: string }>("/api/users", { method: "POST", json: form });
      toast({ title: "User created", description: res.tempPassword ? `Temporary password: ${res.tempPassword}` : undefined, variant: "success" });
      onDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create user");
    } finally { setBusy(false); }
  };

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grid max-h-[60vh] gap-x-4 gap-y-3 overflow-y-auto p-5 sm:grid-cols-2">
      <div><Label required>First name</Label><Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus /></div>
      <div><Label required>Last name</Label><Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
      <div className="sm:col-span-2"><Label required>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" /></div>
      <div><Label required>Role</Label>
        <Select value={form.roleId} onChange={(e) => set("roleId", e.target.value)}>
          <option value="">Select role...</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>
      <div><Label>Team</Label>
        <Select value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
          <option value="">No team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>
      <div><Label>Job title</Label><Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></div>
      <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
      <div className="sm:col-span-2"><Label>Time zone</Label><Input value={form.timeZone} onChange={(e) => set("timeZone", e.target.value)} /></div>
      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <input type="checkbox" checked={form.sendInviteEmail} onChange={(e) => set("sendInviteEmail", e.target.checked)} className="accent-primary" />
        Send account activation email
      </label>
      {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={() => onDone(false)}>Cancel</Button>
        <Button loading={busy} disabled={!form.firstName || !form.lastName || !form.email || !form.roleId} onClick={() => void submit()}>Create user</Button>
      </div>
    </div>
  );
}
