import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, badRequest } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { hashPassword, randomToken } from "@/lib/auth/password";

export const GET = authRoute(async (req, user) => {
  if (!can(user, "user.manage") && !can(user, "user.view") && !can(user, "*") && !can(user, "team.view.self")) throw forbidden();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const teamId = url.searchParams.get("teamId");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? 50));

  // Non-managers may only list their own team (used for assignee pickers)
  let teamFilter: string | undefined = teamId ?? undefined;
  if (!can(user, "user.view") && !can(user, "*")) {
    if (!user.teamId) return ok({ users: [], total: 0 });
    teamFilter = user.teamId;
  }

  const where = {
    AND: [
      q ? { OR: [
        { firstName: { contains: q, mode: "insensitive" as const } },
        { lastName: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ] } : {},
      teamFilter ? { teamId: teamFilter } : {},
    ],
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: { role: true, team: true,
        _count: { select: {
          assignedTickets: true,
        } },
      },
      orderBy: [{ firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);

  const openCounts = await db.ticket.groupBy({
    by: ["assigneeId"],
    where: { deletedAt: null, status: { category: { not: "DONE" } }, assigneeId: { not: null }, ...(teamFilter ? { project: { teamId: teamFilter } } : {}) },
    _count: true,
  });
  const doneCounts = await db.ticket.groupBy({
    by: ["assigneeId"],
    where: { deletedAt: null, status: { category: "DONE" }, assigneeId: { not: null } },
    _count: true,
  });
  const openMap = new Map(openCounts.map((r) => [r.assigneeId!, r._count]));
  const doneMap = new Map(doneCounts.map((r) => [r.assigneeId!, r._count]));

  return ok({
    users: users.map((u) => ({
      id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
      jobTitle: u.jobTitle, status: u.status, lastLoginAt: u.lastLoginAt,
      role: { id: u.role.id, name: u.role.name },
      team: u.team ? { id: u.team.id, name: u.team.name } : null,
      openTickets: openMap.get(u.id) ?? 0,
      completedTickets: doneMap.get(u.id) ?? 0,
    })),
    total,
    page,
    pageSize,
  });
});

const createSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  roleId: z.string().min(1),
  teamId: z.string().nullable().optional(),
  jobTitle: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  timeZone: z.string().max(60).optional(),
  sendInviteEmail: z.boolean().optional(),
});

export const POST = authRoute(async (req, actor) => {
  if (!can(actor, "user.manage") && !can(actor, "*")) throw forbidden();
  const data = await parseBody(req, createSchema);

  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw badRequest("A user with this email already exists");

  const tempPassword = data.password ?? `St-${randomToken(9)}!`;
  const created = await db.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email.toLowerCase().trim(),
      passwordHash: await hashPassword(tempPassword),
      roleId: data.roleId,
      teamId: data.teamId || null,
      jobTitle: data.jobTitle,
      phone: data.phone,
      timeZone: data.timeZone,
      status: data.sendInviteEmail ? "INVITED" : "ACTIVE",
    },
  });

  await db.auditLog.create({ data: { userId: actor.id, action: "USER_CREATED", entityType: "User", entityId: created.id, metadata: { email: created.email } } });

  if (data.sendInviteEmail) {
    const { queueEmail } = await import("@/lib/email/send");
    const { renderEmail } = await import("@/lib/email/templates");
    const email = await renderEmail("user_invitation", { first_name: created.firstName, login_url: `${process.env.APP_URL ?? ""}/login` });
    await queueEmail({ to: created.email, templateKey: "user_invitation", ...email });
  }

  return ok({ id: created.id, tempPassword: data.password ? undefined : tempPassword }, { status: 201 });
});
