import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, badRequest, notFound } from "@/lib/errors";
import { can } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  managerId: z.string().nullable().optional(),
  addMemberIds: z.array(z.string()).optional(),
  removeMemberIds: z.array(z.string()).optional(),
});

export const PATCH = authRoute(async (req, actor, ctx: Ctx) => {
  if (!can(actor, "team.manage") && !can(actor, "*")) throw forbidden();
  const { id } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const team = await db.team.findUnique({ where: { id } });
  if (!team) throw notFound("Team not found");

  await db.$transaction(async (tx) => {
    await tx.team.update({
      where: { id },
      data: { name: data.name, description: data.description, managerId: data.managerId === undefined ? undefined : data.managerId || null },
    });
    if (data.addMemberIds?.length) {
      await tx.user.updateMany({ where: { id: { in: data.addMemberIds } }, data: { teamId: id } });
    }
    if (data.removeMemberIds?.length) {
      await tx.user.updateMany({ where: { id: { in: data.removeMemberIds }, teamId: id }, data: { teamId: null } });
    }
  });
  await db.auditLog.create({ data: { userId: actor.id, action: "TEAM_UPDATED", entityType: "Team", entityId: id } });
  return ok({ success: true });
});

export const DELETE = authRoute(async (_req, actor, ctx: Ctx) => {
  if (!can(actor, "team.manage") && !can(actor, "*")) throw forbidden();
  const { id } = await ctx.params;
  const members = await db.user.count({ where: { teamId: id } });
  if (members > 0) throw badRequest("Move or remove all team members before deleting this team");
  await db.project.updateMany({ where: { teamId: id }, data: { teamId: null } });
  await db.team.delete({ where: { id } });
  await db.auditLog.create({ data: { userId: actor.id, action: "TEAM_DELETED", entityType: "Team", entityId: id } });
  return ok({ success: true });
});
