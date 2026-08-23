"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Skeleton, EmptyState, Input, Label, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type Team = {
  id: string; name: string; description: string | null;
  manager: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  members: { id: string; firstName: string; lastName: string; avatarUrl: string | null; jobTitle: string | null; status: string }[];
  projects: { id: string; key: string; name: string }[];
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<{ teams: Team[] }>("/api/teams").then((d) => setTeams(d.teams)).catch((e) => setError(e instanceof ApiError ? e.message : "Failed"));
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Teams</h1>
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Create team</Button>
      </div>

      {!teams ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : teams.length === 0 ? (
        <EmptyState icon={<UsersRound />} title="No teams yet" description="Create a team to organize people and projects." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <article key={t.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{t.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description ?? ""}</p>
                </div>
                {t.manager && <span className="text-right text-[10px] text-muted-foreground">Lead<br /><b className="text-[11px] text-foreground">{t.manager.firstName} {t.manager.lastName}</b></span>}
              </div>

              <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Members ({t.members.length})</h3>
              <AvatarStack users={t.members} max={8} />
              <ul className="mt-3 space-y-1">
                {t.members.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    <Link href={"/users/" + m.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted">
                      <Avatar user={m} size="xs" />
                      <span className="font-medium">{m.firstName} {m.lastName}</span>
                      <span className="ml-auto text-muted-foreground">{m.jobTitle}</span>
                    </Link>
                  </li>
                ))}
                {t.members.length > 5 && <li className="px-1 text-[11px] text-muted-foreground">+{t.members.length - 5} more</li>}
              </ul>

              {t.projects.length > 0 && (
                <>
                  <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Projects</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {t.projects.map((p) => (
                      <Link key={p.id} href={"/projects/" + p.key} className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium hover:bg-accent hover:text-primary">{p.key}</Link>
                    ))}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create team" width="max-w-md">
        <CreateTeamForm onDone={(ok) => { if (ok) { setCreateOpen(false); void load(); } }} />
      </Dialog>
      {void error}
    </div>
  );
}

function CreateTeamForm({ onDone }: { onDone: (done: boolean) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [managerId, setManagerId] = useState("");
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api<{ users: { id: string; firstName: string; lastName: string }[] }>("/api/meta").then((d) => setUsers(d.users)).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api("/api/teams", { method: "POST", json: { name, description, managerId: managerId || null } });
      toast({ title: "Team created", variant: "success" });
      onDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 p-5">
      <div><Label required>Team name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div><Label>Team lead</Label>
        <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">No lead yet</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </Select>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={() => onDone(false)}>Cancel</Button>
        <Button loading={busy} disabled={name.trim().length < 2} onClick={() => void submit()}>Create team</Button>
      </div>
    </div>
  );
}
