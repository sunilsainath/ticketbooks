import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";
import { ticketScopeFor, can, isSuperAdmin } from "@/lib/rbac";

const DAY = 86400000;

export const GET = authRoute(async (_req, user) => {
  const scope = ticketScopeFor(user);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + DAY);
  const endOfWeek = new Date(endOfToday.getTime() + (7 - ((now.getDay() + 6) % 7)) * DAY);
  void endOfWeek;
  const highPriorityIds = (await db.priority.findMany({ where: { order: { gte: 3 } } })).map((p) => p.id);

  // Manager sees team-level numbers; employee sees personal numbers
  const isManagerish = can(user, "report.view.team") || can(user, "report.view.all") || isSuperAdmin(user);
  const mine = { assigneeId: user.id };
  const openCat = { status: { category: { not: "DONE" } }, deletedAt: null };

  if (isManagerish) {
    const [totalOpen, unassigned, completed, overdue, highPriority, dueToday] = await Promise.all([
      db.ticket.count({ where: { AND: [scope, openCat] } }),
      db.ticket.count({ where: { AND: [scope, openCat, { assigneeId: null }] } }),
      db.ticket.count({ where: { AND: [scope, { deletedAt: null }, { status: { category: "DONE" } }] } }),
      db.ticket.count({ where: { AND: [scope, openCat, { dueDate: { lt: startOfToday } }] } }),
      db.ticket.count({ where: { AND: [scope, openCat, { priorityId: { in: highPriorityIds } }] } }),
      db.ticket.count({ where: { AND: [scope, openCat, { dueDate: { gte: startOfToday, lt: endOfToday } }] } }),
    ]);

    const byStatusRaw = await db.ticket.groupBy({ by: ["statusId"], where: { AND: [scope, { deletedAt: null }] }, _count: true });
    const byPriorityRaw = await db.ticket.groupBy({ by: ["priorityId"], where: { AND: [scope, openCat] }, _count: true });
    const statuses = await db.status.findMany({ orderBy: { order: "asc" } });
    const priorities = await db.priority.findMany({ orderBy: { order: "desc" } });

    // Team workload
    let members: { id: string; name: string; avatarUrl: string | null; open: number; done: number; overdue: number }[] = [];
    if (user.teamId || user.managedTeamIds.length) {
      const teamId = user.managedTeamIds[0] ?? user.teamId!;
      const teamUsers = await db.user.findMany({
        where: { teamId, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      });
      const teamProjectIds = (await db.project.findMany({ where: { teamId }, select: { id: true } })).map((p) => p.id);
      const scopeForTeam = teamProjectIds.length ? { projectId: { in: teamProjectIds } } : scope;
      const workload = await Promise.all(
        teamUsers.map(async (m) => ({
          ...m,
          name: `${m.firstName} ${m.lastName}`,
          open: await db.ticket.count({ where: { AND: [{ assigneeId: m.id }, scopeForTeam], deletedAt: null, status: { category: { not: "DONE" } } } }),
          done: await db.ticket.count({ where: { assigneeId: m.id, ...scopeForTeam, deletedAt: null, status: { category: "DONE" } } }),
          overdue: await db.ticket.count({ where: { AND: [{ assigneeId: m.id }, scopeForTeam, openCat], dueDate: { lt: startOfToday } } }),
        }))
      );
      members = workload.map((w) => ({ id: w.id, name: w.name, avatarUrl: w.avatarUrl, open: w.open, done: w.done, overdue: w.overdue })).sort((a, b) => b.open - a.open);
    }

    // Created vs completed, last 14 days
    const since = new Date(startOfToday.getTime() - 13 * DAY);
    const createdRows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*) AS count FROM "Ticket"
      WHERE "deletedAt" IS NULL AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`;
    const completedRows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', t."updatedAt") AS day, count(*) AS count FROM "Ticket" t
      JOIN "Status" s ON s.id = t."statusId"
      WHERE t."deletedAt" IS NULL AND s.category = 'DONE' AND t."updatedAt" >= ${since}
      GROUP BY 1 ORDER BY 1`;
    const trend: { day: string; created: number; completed: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since.getTime() + i * DAY);
      const key = d.toISOString().slice(0, 10);
      const c = createdRows.find((r) => new Date(r.day).toISOString().slice(0, 10) === key);
      const f = completedRows.find((r) => new Date(r.day).toISOString().slice(0, 10) === key);
      trend.push({ day: key, created: Number(c?.count ?? 0), completed: Number(f?.count ?? 0) });
    }

    // Average resolution time (done tickets updated within last 90d)
    const doneRecent = await db.ticket.findMany({
      where: { AND: [scope, { deletedAt: null }, { status: { category: "DONE" } }, { updatedAt: { gte: new Date(Date.now() - 90 * DAY) } }] },
      select: { createdAt: true, updatedAt: true },
      take: 500,
    });
    const avgResolutionDays = doneRecent.length ? doneRecent.reduce((a, t) => a + (t.updatedAt.getTime() - t.createdAt.getTime()) / DAY, 0) / doneRecent.length : null;

    const recent = await db.ticket.findMany({
      where: { AND: [scope, { deletedAt: null }] },
      include: { project: { select: { key: true } }, status: true, priority: true, type: true, assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });

    return ok({
      view: "manager",
      cards: { totalOpen, unassigned, completed, overdue, highPriority, dueToday, assignedToMe: await db.ticket.count({ where: { AND: [mine, openCat, scope] } }) },
      byStatus: byStatusRaw.map((s) => ({ name: statuses.find((x) => x.id === s.statusId)?.name ?? "?", color: statuses.find((x) => x.id === s.statusId)?.color ?? "#64748b", count: s._count })),
      byPriority: byPriorityRaw.map((p) => ({ name: priorities.find((x) => x.id === p.priorityId)?.name ?? "?", color: priorities.find((x) => x.id === p.priorityId)?.color ?? "#64748b", count: p._count })),
      workload: members,
      trend,
      avgResolutionDays: avgResolutionDays !== null ? Number(avgResolutionDays.toFixed(1)) : null,
      recent: recent.map((t) => ({ key: t.key, title: t.title, status: t.status.name, statusColor: t.status.color, priority: t.priority.name, priorityColor: t.priority.color, typeIcon: t.type.icon, typeName: t.type.name, projectKey: t.project.key, assignee: t.assignee, updatedAt: t.updatedAt })),
    });
  }

  // ---- Employee dashboard ----
  const [myOpen, myOverdue, myDueToday, myHighPriority, myCompleted] = await Promise.all([
    db.ticket.count({ where: { AND: [mine, openCat] } }),
    db.ticket.count({ where: { AND: [mine, openCat, { dueDate: { lt: startOfToday } }] } }),
    db.ticket.count({ where: { AND: [mine, openCat, { dueDate: { gte: startOfToday, lt: endOfToday } }] } }),
    db.ticket.count({ where: { AND: [mine, openCat, { priorityId: { in: highPriorityIds } }] } }),
    db.ticket.count({ where: { AND: [mine, { deletedAt: null }, { status: { category: "DONE" } }] } }),
  ]);
  const [availableWork, recentlyAssigned, recentlyUpdated] = await Promise.all([
    db.ticket.count({ where: { AND: [{ assigneeId: null }, openCat, { project: { teamId: user.teamId ?? "__none__" } }] } }),
    db.ticket.findMany({
      where: { AND: [mine, openCat] },
      include: { project: { select: { key: true } }, status: true, priority: true, type: true },
      orderBy: { createdAt: "desc" }, take: 5,
    }),
    db.ticket.findMany({
      where: { AND: [{ OR: [{ assigneeId: user.id }, { reporterId: user.id }, { watchers: { some: { userId: user.id } } }] }, { deletedAt: null }] },
      include: { project: { select: { key: true } }, status: true, priority: true, type: true },
      orderBy: { updatedAt: "desc" }, take: 5,
    }),
  ]);

  return ok({
    view: "employee",
    cards: { myOpen, myOverdue, myDueToday, myHighPriority, myCompleted, availableWork },
    recentlyAssigned: recentlyAssigned.map((t) => ({ key: t.key, title: t.title, status: t.status.name, statusColor: t.status.color, priority: t.priority.name, priorityColor: t.priority.color, typeIcon: t.type.icon, typeName: t.type.name, projectKey: t.project.key, createdAt: t.createdAt })),
    recentlyUpdated: recentlyUpdated.map((t) => ({ key: t.key, title: t.title, status: t.status.name, statusColor: t.status.color, priority: t.priority.name, priorityColor: t.priority.color, typeIcon: t.type.icon, typeName: t.type.name, projectKey: t.project.key, updatedAt: t.updatedAt })),
  });
});
