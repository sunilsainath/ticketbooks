"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Skeleton, EmptyState } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";

type Project = {
  id: string; key: string; name: string; description: string | null;
  lead: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  team: { id: string; name: string } | null;
  totalTickets: number; openTickets: number;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ projects: Project[] }>("/api/projects").then((d) => setProjects(d.projects)).catch((e) => setError(e instanceof ApiError ? e.message : "Failed"));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!projects) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  if (projects.length === 0) return <EmptyState icon={<FolderKanban />} title="No projects yet" description="Ask an admin to create your first project." />;

  const colorFor = (key: string) => {
    let h = 0;
    for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return ["#27272a", "#3f3f46", "#52525b", "#71717a", "#18181b", "#a1a1aa"][h % 6];
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold tracking-tight">Projects</h1>
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
    </div>
  );
}
