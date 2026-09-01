"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Skeleton, EmptyState, Input, Label } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Project = {
  id: string; key: string; name: string; description: string | null;
  lead: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  team: { id: string; name: string } | null;
  totalTickets: number; openTickets: number;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", key: "", description: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>("/api/projects").then((d) => setProjects(d.projects)).catch((e) => setError(e instanceof ApiError ? e.message : "Failed"));
    api<{ user: { permissions: string[] } }>("/api/auth/me").then((d) => {
      const perms = d.user.permissions ?? [];
      setCanCreate(perms.includes("*") || perms.includes("project.manage"));
    }).catch(() => {});
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.key.trim()) {
      setFormError("Name and key are required");
      return;
    }
    setCreating(true);
    try {
      await api("/api/projects", { method: "POST", json: { name: form.name.trim(), key: form.key.trim(), description: form.description.trim() || undefined } });
      setShowCreate(false);
      setForm({ name: "", key: "", description: "" });
      const d = await api<{ projects: Project[] }>("/api/projects");
      setProjects(d.projects);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!projects) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;

  const colorFor = (key: string) => {
    let h = 0;
    for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return ["#27272a", "#3f3f46", "#52525b", "#71717a", "#18181b", "#a1a1aa"][h % 6];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Projects</h1>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Project</Button>
        )}
      </div>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Create project" description="Add a new project. Key is unique and becomes the ticket prefix.">
        <form onSubmit={createProject} className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor="p-name" required>Project name</Label>
            <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website Revamp" maxLength={80} required />
          </div>
          <div>
            <Label htmlFor="p-key" required>Project key</Label>
            <Input id="p-key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} placeholder="e.g. WEB" maxLength={10} required style={{ textTransform: "uppercase" }} />
            <p className="mt-1 text-xs text-muted-foreground">2–10 letters/digits, starting with a letter. This prefixes tickets (e.g. WEB-1001).</p>
          </div>
          <div>
            <Label htmlFor="p-desc">Description</Label>
            <textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" maxLength={1000} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
          </div>
          {formError && <p role="alert" className="text-xs text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={creating}>Create project</Button>
          </div>
        </form>
      </Dialog>
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          description={canCreate ? "Create your first project to get started." : "Ask an admin to create your first project."}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={"/projects/" + p.key} className="group rounded-xl border bg-card p-5 shadow-sm transition hover:border-ring hover:shadow-md">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: colorFor(p.key) }}>
                  {p.key}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold group-hover:text-primary">{p.name}</h2>
                  <p className="text-xs text-muted-foreground">{p.team?.name ?? "No team"}</p>
                </div>
                <Avatar user={p.lead} size="md" />
              </div>
              {p.description && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
              <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs">
                <span><b>{p.openTickets}</b> <span className="text-muted-foreground">open</span></span>
                <span><b>{p.totalTickets}</b> <span className="text-muted-foreground">total</span></span>
                {p.totalTickets > 0 && (
                  <span className="ml-auto text-muted-foreground">
                    {Math.round(((p.totalTickets - p.openTickets) / p.totalTickets) * 100)}% done
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
