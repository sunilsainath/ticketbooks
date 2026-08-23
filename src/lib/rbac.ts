import type { SessionUser } from "./auth/session";

export type { SessionUser };
export { PERMISSION_CATALOG } from "./constants";

/** Permission check. Roles store a JSON array of permission keys; "*" grants everything. */
export function can(user: Pick<SessionUser, "permissions"> | null, permission: string): boolean {
  if (!user) return false;
  const perms = user.permissions ?? [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

export function canAny(user: Pick<SessionUser, "permissions"> | null, permissions: string[]): boolean {
  return permissions.some((p) => can(user, p));
}

export function isSuperAdmin(user: Pick<SessionUser, "permissions">): boolean {
  return user.permissions.includes("*");
}

/**
 * Visibility scope for tickets based on role:
 * - Super admin / report.view.all: everything
 * - Manager (ticket.edit.team / report.view.team): their team's projects + own involvement
 * - Employee: assigned/reported/watched by self + unassigned tickets in own team's projects
 */
export function ticketScopeFor(
  user: SessionUser
): Record<string, unknown> {
  if (isSuperAdmin(user)) return {};
  const isManager = can(user, "ticket.edit.team") || can(user, "report.view.team");
  if (isManager && user.teamId) {
    return {
      OR: [
        { project: { teamId: user.teamId } },
        { assigneeId: user.id },
        { reporterId: user.id },
        { watchers: { some: { userId: user.id } } },
      ],
    };
  }
  const base: Record<string, unknown>[] = [
    { assigneeId: user.id },
    { reporterId: user.id },
    { watchers: { some: { userId: user.id } } },
  ];
  if (user.teamId) base.push({ AND: [{ assigneeId: null }, { project: { teamId: user.teamId } }] });
  return { OR: base };
}
