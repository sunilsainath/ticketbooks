import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";

const schema = z.object({
  keys: z.array(z.string()).min(1).max(100),
  action: z.enum(["assign", "status", "priority", "label", "delete", "project"]),
  value: z.string().nullable(),
});

/** Bulk operations for managers */
export const PATCH = authRoute(async (req, actor) => {
  const data = await parseBody(req, schema);
  const results = { updated: 0, failed: [] as { key: string; error: string }[] };

  for (const key of data.keys) {
    try {
      const ticket = await db.ticket.findFirst({ where: { key: key.toUpperCase(), deletedAt: null } });
      if (!ticket) throw new Error("Ticket not found");

      if (data.action === "delete") {
        await db.$transaction(async (tx) => {
          await tx.ticket.update({ where: { id: ticket.id }, data: { deletedAt: new Date() } });
          await tx.ticketHistory.create({ data: { ticketId: ticket.id, userId: actor.id, field: "deleted", newValue: "archived" } });
        });
      } else if (data.action === "label") {
        if (!data.value) throw new Error("Label required");
        await db.ticketLabel.upsert({
          where: { ticketId_labelId: { ticketId: ticket.id, labelId: data.value } },
          create: { ticketId: ticket.id, labelId: data.value },
          update: {},
        });
        await db.ticketHistory.create({ data: { ticketId: ticket.id, userId: actor.id, field: "labels", newValue: data.value } });
      } else {
        const patch: Record<string, unknown> =
          data.action === "assign" ? { assigneeId: data.value || null }
          : data.action === "status" ? { statusId: data.value }
          : data.action === "priority" ? { priorityId: data.value }
          : { projectId: data.value };
        // Reuse service for audit + notifications on assign/status/priority
        const { updateTicket } = await import("@/lib/tickets/service");
        await updateTicket(actor, ticket.key, patch as never);
      }
      results.updated += 1;
    } catch (e) {
      results.failed.push({ key, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  await db.auditLog.create({ data: { userId: actor.id, action: "BULK_UPDATE", entityType: "Ticket", metadata: { keys: data.keys.length, action: data.action, updated: results.updated } } });
  return ok(results);
});
