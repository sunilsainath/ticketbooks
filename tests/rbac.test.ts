import { describe, it, expect } from "vitest";
import { can, canAny, ticketScopeFor, type SessionUser } from "@/lib/rbac";

const userWith = (permissions: string[], extra: Partial<SessionUser> = {}): SessionUser => ({
  id: "u1",
  email: "u@test.io",
  firstName: "Test",
  lastName: "User",
  avatarUrl: null,
  jobTitle: null,
  timeZone: null,
  phone: null,
  status: "ACTIVE",
  teamId: "team-1",
  teamName: "Team",
  managedTeamIds: [],
  roleId: "r1",
  roleName: "Employee",
  permissions,
  prefs: {},
  ...extra,
});

describe("RBAC permission checks", () => {
  it("grants everything to wildcard admin", () => {
    const admin = userWith(["*"]);
    expect(can(admin, "user.manage")).toBe(true);
    expect(can(admin, "ticket.assign")).toBe(true);
    expect(can(admin, "anything.at.all")).toBe(true);
  });

  it("checks specific permissions", () => {
    const manager = userWith(["ticket.create", "ticket.assign", "report.view.team"]);
    expect(can(manager, "ticket.create")).toBe(true);
    expect(can(manager, "ticket.assign")).toBe(true);
    expect(can(manager, "user.manage")).toBe(false);
    expect(can(manager, "settings.manage")).toBe(false);
  });

  it("denies null users", () => {
    expect(can(null, "ticket.comment")).toBe(false);
    expect(canAny(null, ["ticket.comment"])).toBe(false);
  });

  it("canAny matches any of the list", () => {
    const u = userWith(["ticket.claim"]);
    expect(canAny(u, ["ticket.assign", "ticket.claim"])).toBe(true);
    expect(canAny(u, ["ticket.assign", "ticket.delete.team"])).toBe(false);
  });
});

describe("Ticket visibility scope", () => {
  it("admins see everything", () => {
    const admin = userWith(["*"]);
    expect(ticketScopeFor(admin)).toEqual({});
  });

  it("managers are scoped to team projects plus own involvement", () => {
    const mgr = userWith(["ticket.edit.team", "report.view.team"]);
    const scope = ticketScopeFor(mgr) as { OR: Record<string, unknown>[] };
    expect(scope.OR).toBeDefined();
    expect(JSON.stringify(scope.OR)).toContain("teamId");
    // still sees own assignments even outside team projects
    expect(JSON.stringify(scope.OR)).toContain("assigneeId");
  });

  it("employees see own work + unassigned tickets in their team's projects", () => {
    const emp = userWith(["ticket.claim"]);
    const scope = ticketScopeFor(emp) as { OR: Record<string, unknown>[] };
    const flat = JSON.stringify(scope.OR);
    expect(flat).toContain("assigneeId");
    expect(flat).toContain("reporterId");
    expect(flat).toContain("watchers");
    expect(flat).toContain("assigneeId\":null"); // unassigned-in-team clause
  });
});
