import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { flagBreachedTickets } from "@/lib/sla";

/**
 * Integration test: the flagging pass must
 *  1. flag a breached ticket exactly once (history + slaFlaggedAt)
 *  2. be idempotent on re-run (no duplicate flags/history)
 */
const db = new PrismaClient();

let projectId: string;
let breachedTicketId: string;
let metTicketId: string;
let policyTicketId: string;

async function setup() {
  const status = await db.status.findFirstOrThrow({ where: { name: "To Do" } });
  const done = await db.status.findFirstOrThrow({ where: { name: "Done" } });
  const priority = await db.priority.findFirstOrThrow();
  const type = await db.ticketType.findFirstOrThrow();
  const project = await db.project.create({
    data: { key: `SLA${String(Date.now()).slice(-6)}`, name: "SLA scratch", nextNumber: 5000 },
  });
  projectId = project.id;

  const breached = await db.ticket.create({
    data: {
      key: `${project.key}-5001`, number: 5001, projectId,
      typeId: type.id, statusId: status.id, priorityId: priority.id,
      title: "Breached SLA test", dueDate: new Date(Date.now() - 3 * 3600000),
    },
  });
  const met = await db.ticket.create({
    data: {
      key: `${project.key}-5002`, number: 5002, projectId,
      typeId: type.id, statusId: done.id, priorityId: priority.id,
      title: "Met SLA test", dueDate: new Date(Date.now() - 3 * 3600000),
    },
  });
  // Policy-target breach: no manual due date, but resolveDueAt already passed
  const policyTarget = await db.ticket.create({
    data: {
      key: `${project.key}-5003`, number: 5003, projectId,
      typeId: type.id, statusId: status.id, priorityId: priority.id,
      title: "Policy target breach test",
      resolveDueAt: new Date(Date.now() - 2 * 3600000),
    },
  });
  breachedTicketId = breached.id;
  metTicketId = met.id;
  policyTicketId = policyTarget.id;
}

afterAll(async () => {
  if (projectId) {
    await db.ticketHistory.deleteMany({ where: { ticket: { projectId } } }).catch(() => {});
    await db.notification.deleteMany({ where: { ticket: { projectId } } }).catch(() => {});
    await db.emailEvent.deleteMany({ where: { ticket: { projectId } } }).catch(() => {});
    await db.ticket.deleteMany({ where: { projectId } }).catch(() => {});
    await db.project.deleteMany({ where: { id: projectId } }).catch(() => {});
  }
  await db.$disconnect();
});

describe("SLA flagging pass", () => {
  it("flags breached tickets once and never touches done tickets", async () => {
    await setup();

    const first = await flagBreachedTickets();
    expect(first).toBeGreaterThanOrEqual(2);

    const flagged = await db.ticket.findUnique({ where: { id: breachedTicketId } });
    expect(flagged?.slaFlaggedAt).not.toBeNull();

    // policy-derived target breach also flagged
    const policyFlagged = await db.ticket.findUnique({ where: { id: policyTicketId } });
    expect(policyFlagged?.slaFlaggedAt).not.toBeNull();

    const history = await db.ticketHistory.findMany({ where: { ticketId: breachedTicketId, field: "sla" } });
    expect(history.length).toBe(1);
    expect(history[0].newValue).toBe("breached");

    // Done ticket with past due date is NOT flagged
    const met = await db.ticket.findUnique({ where: { id: metTicketId } });
    expect(met?.slaFlaggedAt).toBeNull();

    // Second pass: idempotent - nothing new
    const second = await flagBreachedTickets();
    void second;
    const historyAfter = await db.ticketHistory.findMany({ where: { ticketId: breachedTicketId, field: "sla" } });
    expect(historyAfter.length).toBe(1);
    const refetched = await db.ticket.findUnique({ where: { id: breachedTicketId }, select: { slaFlaggedAt: true } });
    expect(refetched?.slaFlaggedAt).not.toBeNull();
    expect(second).toBe(0); // this scratch ticket was already handled
  });
});
