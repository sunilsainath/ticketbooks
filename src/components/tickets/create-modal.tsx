"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/field";
import { RichTextEditor } from "./rich-text-editor";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/providers";

type Meta = {
  statuses: { id: string; name: string; isDefault: boolean }[];
  priorities: { id: string; name: string; order: number; isDefault: boolean }[];
  types: { id: string; name: string; icon: string; isSubtask: boolean }[];
  projects: { id: string; key: string; name: string }[];
  users: { id: string; firstName: string; lastName: string; email: string }[];
  labels: { id: string; name: string; color: string }[];
  sprints: { id: string; name: string; project?: { key: string } }[];
};

export default function CreateTicketModal({ onClose, initialProjectKey }: { onClose: (created: boolean) => void; initialProjectKey?: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    projectId: initialProjectKey ?? "",
    typeId: "",
    title: "",
    description: "",
    priorityId: "",
    statusId: "",
    assigneeId: "",
    sprintId: "",
    dueDate: "",
    startDate: "",
    storyPoints: "",
    labelIds: [] as string[],
  });
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    api<Meta>("/api/meta").then((m) => {
      setMeta(m);
      const defaultProject = initialProjectKey
        ? m.projects.find((p) => p.key === initialProjectKey)?.id
        : m.projects[0]?.id;
      setForm((f) => ({
        ...f,
        projectId: f.projectId || defaultProject || "",
        typeId: f.typeId || m.types.find((t) => !t.isSubtask)?.id || "",
        priorityId: f.priorityId || m.priorities.find((p) => p.isDefault)?.id || "",
        statusId: f.statusId || m.statuses.find((s) => s.isDefault)?.id || "",
      }));
    }).catch((e) => setError(e.message));
  }, [initialProjectKey]);

  const projectUsers = useMemo(() => meta?.users ?? [], [meta]);
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.projectId) return setError("Select a project");
    if (!form.title.trim() || form.title.trim().length < 3) return setError("Title must be at least 3 characters");
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ key: string }>("/api/tickets", {
        method: "POST",
        json: {
          ...form,
          assigneeId: form.assigneeId || null,
          sprintId: form.sprintId || null,
          storyPoints: form.storyPoints ? Number(form.storyPoints) : null,
          dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`).toISOString() : null,
          startDate: form.startDate ? new Date(`${form.startDate}T12:00:00`).toISOString() : null,
          description: form.description,
        },
      });
      toast({ title: `Ticket ${created.key} created`, variant: "success" });
      onClose(true);
      router.push(`/tickets/${created.key}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not create ticket";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => onClose(false)} title="Create ticket" description="Tickets are numbered automatically per project." width="max-w-3xl">
      {!meta ? (
        <div className="space-y-3 p-5">
          {[...Array(6)].map((_, i) => <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />)}
        </div>
      ) : (
        <div className="grid max-h-[70vh] gap-x-6 gap-y-4 overflow-y-auto p-5 md:grid-cols-2">
          <div>
            <Label htmlFor="ct-project" required>Project</Label>
            <Select id="ct-project" value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">Select project...</option>
              {meta.projects.map((p) => <option key={p.id} value={p.id}>{p.key} - {p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ct-type" required>Ticket type</Label>
            <Select id="ct-type" value={form.typeId} onChange={(e) => set("typeId", e.target.value)}>
              {meta.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ct-title" required>Summary</Label>
            <Input id="ct-title" value={form.title} maxLength={300} onChange={(e) => set("title", e.target.value)} placeholder="Short, action-oriented summary" autoFocus />
          </div>

          <div className="md:col-span-2">
            <Label>Description</Label>
            <RichTextEditor value={form.description} onChange={(html) => set("description", html)} placeholder="Describe the work. Use @mentions to loop people in." />
          </div>

          <div>
            <Label htmlFor="ct-priority">Priority</Label>
            <Select id="ct-priority" value={form.priorityId} onChange={(e) => set("priorityId", e.target.value)}>
              {meta.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ct-status">Status</Label>
            <Select id="ct-status" value={form.statusId} onChange={(e) => set("statusId", e.target.value)}>
              {meta.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ct-assignee">Assignee</Label>
            <Select id="ct-assignee" value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
              <option value="">Unassigned (available for pickup)</option>
              {projectUsers.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} - {u.email}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ct-sprint">Sprint</Label>
            <Select id="ct-sprint" value={form.sprintId} onChange={(e) => set("sprintId", e.target.value)}>
              <option value="">Backlog (no sprint)</option>
              {meta.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ct-start">Start date</Label>
            <Input id="ct-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ct-due">Due date</Label>
            <Input id="ct-due" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ct-points">Story points</Label>
            <Input id="ct-points" type="number" min={0} max={1000} value={form.storyPoints} onChange={(e) => set("storyPoints", e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label htmlFor="ct-labels">Labels</Label>
            <div className="flex max-h-[72px] flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-input bg-card p-2">
              {meta.labels.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  onClick={() => set("labelIds", form.labelIds.includes(l.id) ? form.labelIds.filter((x) => x !== l.id) : [...form.labelIds, l.id])}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${form.labelIds.includes(l.id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  style={!form.labelIds.includes(l.id) ? { color: l.color } : undefined}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5">
        <p className="text-xs text-destructive">{error}</p>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create ticket</Button>
        </div>
      </div>
    </Dialog>
  );
}
