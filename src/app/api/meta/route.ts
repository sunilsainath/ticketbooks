import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";

/** Aggregated reference data for form pickers */
export const GET = authRoute(async (_req) => {
  const [statuses, priorities, types, projects, labels, sprints, teams] = await Promise.all([
    db.status.findMany({ orderBy: { order: "asc" } }),
    db.priority.findMany({ orderBy: { order: "desc" } }),
    db.ticketType.findMany({ orderBy: { order: "asc" } }),
    db.project.findMany({ where: { archived: false }, select: { id: true, key: true, name: true, teamId: true }, orderBy: { key: "asc" } }),
    db.label.findMany({ include: { project: { select: { key: true } } }, orderBy: { name: "asc" } }),
    db.sprint.findMany({ where: { state: { in: ["PLANNED", "ACTIVE"] } }, include: { project: { select: { key: true } } }, orderBy: { createdAt: "desc" } }),
    db.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Full directory for assignee pickers
  // Admins/managers get full directory for assignee pickers
  const allUsers = await db.user.findMany({
    where: { status: { not: "DISABLED" } },
    select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, teamId: true },
    orderBy: { firstName: "asc" },
  });

  return ok({
    statuses,
    priorities,
    types,
    projects,
    users: allUsers,
    labels,
    sprints,
    teams,
  });
});
