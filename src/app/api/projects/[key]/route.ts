import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, notFound } from "@/lib/errors";
import { can } from "@/lib/rbac";

type Ctx = { params: Promise<{ key: string }> };

export const GET = authRoute(async (_req, _user, ctx: Ctx) => {
  const { key } = await ctx.params;
  const project = await db.project.findUnique({
    where: { key: key.toUpperCase() },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      team: { include: { manager: { select: { id: true, firstName: true, lastName: true } }, members: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } } },
      sprints: { orderBy: { createdAt: "desc" } },
      labels: true,
      _count: { select: { tickets: { where: { deletedAt: null } } } },
    },
  });
  if (!project) throw notFound("Project not found");

  const statusCounts = await db.ticket.groupBy({ by: ["statusId"], where: { projectId: project.id, deletedAt: null }, _count: true });
  const priorityCounts = await db.ticket.groupBy({ by: ["priorityId"], where: { projectId: project.id, deletedAt: null }, _count: true });
  const [statuses, priorities] = await Promise.all([db.status.findMany(), db.priority.findMany()]);
  const sMap = new Map(statuses.map((s) => [s.id, s]));
  const pMap = new Map(priorities.map((p) => [p.id, p]));

  return ok({
    project: {
      id: project.id, key: project.key, name: project.name, description: project.description,
      lead: project.lead, team: project.team, sprints: project.sprints, labels: project.labels,
      totalTickets: project._count.tickets,
    },
    statusBreakdown: statusCounts.map((c) => ({ ...sMap.get(c.statusId), count: c._count })).filter((x) => x.id).sort((a, b) => (a!.order ?? 0) - (b!.order ?? 0)),
    priorityBreakdown: priorityCounts.map((c) => ({ ...pMap.get(c.priorityId), count: c._count })).filter((x) => x.id),
  });
});

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(1000).nullable().optional(),
  leadId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export const PATCH = authRoute(async (req, actor, ctx: Ctx) => {
  if (!can(actor, "*") && !can(actor, "project.manage")) throw forbidden();
  const { key } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const project = await db.project.findUnique({ where: { key: key.toUpperCase() } });
  if (!project) throw notFound("Project not found");
  const updated = await db.project.update({
    where: { id: project.id },
    data: { name: data.name, description: data.description, leadId: data.leadId === undefined ? undefined : data.leadId || null, teamId: data.teamId === undefined ? undefined : data.teamId || null, archived: data.archived },
  });
  await db.auditLog.create({ data: { userId: actor.id, action: "PROJECT_UPDATED", entityType: "Project", entityId: project.id } });
  return ok(updated);
});
