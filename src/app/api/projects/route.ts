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
  key: z
    .string()
    .min(2)
    .max(10)
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key must be 2-10 letters/digits (A-Z, 0-9), starting with a letter")),
  description: z.string().max(1000).optional(),
  leadId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
});

export const POST = authRoute(async (req, actor) => {
  if (!can(actor, "*") && !can(actor, "project.manage")) throw forbidden("You do not have permission to create projects. Requires Admin or Project Manager role.");
  const data = await parseBody(req, createSchema);
  // data.key is already uppercased via zod transform
  const existing = await db.project.findUnique({ where: { key: data.key } });
  if (existing) throw badRequest(`Project key ${data.key} is already in use`);

  // Validate FKs to give clear 400 instead of 500 on invalid IDs
  if (data.leadId) {
    const leadExists = await db.user.findUnique({ where: { id: data.leadId }, select: { id: true } });
    if (!leadExists) throw badRequest("Lead user not found");
  }
  if (data.teamId) {
    const teamExists = await db.team.findUnique({ where: { id: data.teamId }, select: { id: true } });
    if (!teamExists) throw badRequest("Team not found");
  }

  let project;
  try {
    project = await db.project.create({
      data: {
        name: data.name.trim(),
        key: data.key.toUpperCase(),
        description: data.description?.trim(),
        leadId: data.leadId || null,
        teamId: data.teamId || null,
        nextNumber: 1000,
        members: actor.id ? { create: [{ userId: actor.id }] } : undefined,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique")) throw badRequest(`Project key ${data.key} is already in use`);
    throw e;
  }
  await db.auditLog.create({ data: { userId: actor.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id, metadata: { key: project.key } } });
  return ok(project, { status: 201 });
});
