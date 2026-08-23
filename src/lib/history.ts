import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient | typeof db;

export async function recordHistory(
  tx: Tx,
  data: { ticketId: string; userId?: string | null; field: string; oldValue?: string | null; newValue?: string | null; message?: string }
) {
  await tx.ticketHistory.create({
    data: {
      ticketId: data.ticketId,
      userId: data.userId ?? null,
      field: data.field,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      message: data.message ?? null,
    },
  });
}

export async function audit(
  data: { userId?: string | null; action: string; entityType: string; entityId?: string | null; ip?: string | null; userAgent?: string | null; metadata?: Record<string, unknown> },
  tx?: Tx
) {
  const client = tx ?? db;
  try {
    await client.auditLog.create({
      data: {
        userId: data.userId ?? null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (e) {
    // Audit logging must never break the primary action, but surface loudly in logs.
    console.error("[audit] failed to write audit entry:", e);
  }
}
