import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, badRequest } from "@/lib/errors";
import { can } from "@/lib/rbac";

export const GET = authRoute(async (_req, user) => {
  if (!can(user, "team.view") && !can(user, "team.view.self") && !can(user, "*")) throw forbidden();
  const teams = await db.team.findMany({
    include: {
      manager: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      members: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true, status: true } },
      projects: { select: { id: true, name: true, key: true } },
    },
    orderBy: { name: "asc" },
  });
  const visible = can(user, "team.view") || can(user, "*") ? teams : teams.filter((t) => t.id === user.teamId);
  return ok({ teams: visible });
});

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  managerId: z.string().nullable().optional(),
});

export const POST = authRoute(async (req, actor) => {
  if (!can(actor, "team.manage") && !can(actor, "*")) throw forbidden();
  const data = await parseBody(req, createSchema);
  const exists = await db.team.findUnique({ where: { name: data.name } });
  if (exists) throw badRequest("A team with this name already exists");
  const team = await db.team.create({ data: { name: data.name, description: data.description, managerId: data.managerId || null } });
  await db.auditLog.create({ data: { userId: actor.id, action: "TEAM_CREATED", entityType: "Team", entityId: team.id, metadata: { name: team.name } } });
  return ok(team, { status: 201 });
});
