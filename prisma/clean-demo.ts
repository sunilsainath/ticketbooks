import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("Cleaning demo data...");

  const before = {
    projects: await db.project.count(),
    tickets: await db.ticket.count(),
    comments: await db.comment.count(),
    attachments: await db.attachment.count(),
    labels: await db.label.count(),
    sprints: await db.sprint.count(),
    notifications: await db.notification.count(),
    emailEvents: await db.emailEvent.count(),
    auditLogs: await db.auditLog.count(),
    otpTokens: await db.otpToken.count().catch(() => 0),
    passwordResets: await db.passwordResetToken.count(),
    sessions: await db.session.count(),
    users: await db.user.count(),
    teams: await db.team.count(),
  };
  console.log("Before:", before);

  // Order matters for FKs - delete dependents first
  // Keep: Role, Status, Priority, TicketType, Setting, Team, User (core)
  // Delete: demo transactional data (sequential to avoid PgBouncer transaction issues)
  await db.customFieldValue.deleteMany();
  await db.customFieldDef.deleteMany();
  await db.automationRule.deleteMany();
  await db.savedFilter.deleteMany();
  await db.auditLog.deleteMany();
  await db.emailEvent.deleteMany();
  await db.notification.deleteMany();
  await db.ticketHistory.deleteMany();
  await db.attachment.deleteMany();
  await db.comment.deleteMany();
  await db.ticketWatcher.deleteMany();
  await db.ticketLabel.deleteMany();
  await db.ticket.deleteMany();
  await db.sprint.deleteMany();
  await db.label.deleteMany();
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  try { await db.otpToken.deleteMany(); } catch {}
  await db.passwordResetToken.deleteMany();
  await db.session.deleteMany();

  // Optionally clean test users (emails containing @t.io or sec-test/flow-test)
  const testUsers = await db.user.findMany({
    where: { OR: [{ email: { contains: "@t.io" } }, { email: { contains: "sec-test" } }, { email: { contains: "flow-test" } }, { email: { contains: "test-otp" } }] },
    select: { id: true, email: true },
  });
  if (testUsers.length) {
    console.log(`Deleting ${testUsers.length} test users:`, testUsers.map(u=>u.email).join(", "));
    await db.user.deleteMany({ where: { id: { in: testUsers.map(u=>u.id) } } });
  }

  // Keep at least one project for empty-state handling? No, clean all per request.
  const after = {
    projects: await db.project.count(),
    tickets: await db.ticket.count(),
    comments: await db.comment.count(),
    attachments: await db.attachment.count(),
    labels: await db.label.count(),
    sprints: await db.sprint.count(),
    notifications: await db.notification.count(),
    emailEvents: await db.emailEvent.count(),
    auditLogs: await db.auditLog.count(),
    otpTokens: await db.otpToken.count().catch(() => 0),
    passwordResets: await db.passwordResetToken.count(),
    sessions: await db.session.count(),
    users: await db.user.count(),
    teams: await db.team.count(),
    roles: await db.role.count(),
    statuses: await db.status.count(),
  };
  console.log("After:", after);
  console.log("Demo data cleaned. Core config preserved (roles, statuses, priorities, types, teams, users).");
  console.log(`Projects ${before.projects} -> ${after.projects}, Tickets ${before.tickets} -> ${after.tickets}`);
}

main().catch(e=>{ console.error(e); process.exit(1); }).finally(()=> db.$disconnect());
