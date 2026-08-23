import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, badRequest } from "@/lib/errors";
import { can } from "@/lib/rbac";

export const GET = authRoute(async (_req, user) => {
  const projects = await db.project.findMany({
    where: { archived: false },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { tickets: { where: { deletedAt: null } } } },
    },
    orderBy: { key: "asc" },
  });

  const counts = await db.ticket.groupBy({
    by: ["projectId"],
    where: { deletedAt: null, status: { category: { not: "DONE" } } },
    _count: true,
  });
  const openMap = new Map(counts.map((c) => [c.projectId, c._count]));

  return ok({
    projects: projects.map((p) => ({
      id: p.id, key: p.key, name: p.name, description: p.description,
      lead: p.lead, team: p.team,
      totalTickets: p._count.tickets,
      openTickets: openMap.get(p.id) ?? 0,
    })),
  });
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key must be 2-10 uppercase letters/digits"),
  description: z.string().max(1000).optional(),
  leadId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
});

export const POST = authRoute(async (req, actor) => {
  if (!can(actor, "*") && !can(actor, "project.manage")) throw forbidden();
  const data = await parseBody(req, createSchema);
  const existing = await db.project.findUnique({ where: { key: data.key } });
  if (existing) throw badRequest(`Project key ${data.key} is already in use`);

  const project = await db.project.create({
    data: {
      name: data.name,
      key: data.key.toUpperCase(),
      description: data.description,
      leadId: data.leadId || null,
      teamId: data.teamId || null,
      nextNumber: 1000,
      members: actor.id ? { create: [{ userId: actor.id }] } : undefined,
    },
  });
  await db.auditLog.create({ data: { userId: actor.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id, metadata: { key: project.key } } });
  return ok(project, { status: 201 });
});
