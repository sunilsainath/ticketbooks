import { computeSla, type SlaPolicy } from "@/lib/sla";

export function serializeTicket(t: {
  id: string; key: string; title: string; storyPoints: number | null; dueDate: Date | null;
  updatedAt: Date; createdAt: Date; reopenedCount?: number;
  project: { key: string; name: string };
  type: { name: string; icon: string; id: string };
  status: { name: string; color: string; category: string; id: string };
  priority: { name: string; color: string; id: string; order: number };
  sprint?: { id: string; name: string } | null;
  assignee: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  reporter?: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  _count?: { comments?: number; attachments?: number; children?: number };
}, policy?: SlaPolicy) {
  const sla = computeSla({ dueDate: t.dueDate, resolveDueAt: (t as unknown as { resolveDueAt?: Date | null }).resolveDueAt ?? null, statusCategory: t.status.category }, policy);
  return {
    id: t.id, key: t.key, title: t.title,
    projectKey: t.project.key, projectName: t.project.name,
    type: { id: t.type.id, name: t.type.name, icon: t.type.icon },
    status: { id: t.status.id, name: t.status.name, color: t.status.color, category: t.status.category },
    priority: { id: t.priority.id, name: t.priority.name, color: t.priority.color },
    assignee: t.assignee, reporter: t.reporter ?? null,
    storyPoints: t.storyPoints, dueDate: t.dueDate,
    labels: t.labels.map((l) => l.label),
    commentCount: t._count?.comments ?? 0,
    attachmentCount: t._count?.attachments ?? 0,
    subtaskCount: t._count?.children ?? 0,
    updatedAt: t.updatedAt, createdAt: t.createdAt,
    sla,
  };
}

