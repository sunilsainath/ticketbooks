import { db } from "@/lib/db";

/**
 * SLA model (configurable per priority):
 *
 * Admins define resolution-time targets per priority (Settings > SLA), e.g.
 *   Critical = 4h, High = 24h, Medium = 72h, Low = 168h (+ optional default).
 *
 * Effective SLA deadline resolution order for a ticket:
 *   1. explicit dueDate (manual deadline always wins)
 *   2. resolveDueAt (stamped at creation/change time = now + priority target)
 *   3. none
 *
 * Status is computed on the fly:
 *   breached  - deadline passed while ticket open (flagged in DB exactly once)
 *   at_risk   - deadline within riskHours (default 24h)
 *   on_track  - open, further out
 *   met       - completed (status category DONE)
 *   none      - no deadline resolvable
 */

export const SLA_RISK_HOURS = Number(process.env.SLA_RISK_HOURS ?? 24);

export type SlaPolicy = {
  enabled: boolean;
  /** hours before the deadline where a ticket counts as "at risk" */
  riskHours: number;
  /** fallback target hours when a priority has no specific entry */
  defaultHours: number | null;
  /** priorityId -> resolution target in hours */
  byPriority: Record<string, number>;
};

export const DEFAULT_SLA_POLICY: SlaPolicy = {
  enabled: true,
  riskHours: SLA_RISK_HOURS,
  defaultHours: null,
  byPriority: {},
};

export function normalizePolicy(raw: unknown): SlaPolicy {
  const r = (raw ?? {}) as Partial<SlaPolicy>;
  const byPriority: Record<string, number> = {};
  if (r.byPriority && typeof r.byPriority === "object") {
    for (const [k, v] of Object.entries(r.byPriority)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) byPriority[k] = Math.round(n);
    }
  }
  return {
    enabled: r.enabled !== false,
    riskHours: Number.isFinite(Number(r.riskHours)) && Number(r.riskHours) > 0 ? Number(r.riskHours) : 24,
    defaultHours: r.defaultHours != null && Number(r.defaultHours) > 0 ? Number(r.defaultHours) : null,
    byPriority,
  };
}

/** Target hours configured for a priority (falls back to defaultHours) */
export function targetHoursFor(policy: SlaPolicy, priorityId?: string | null): number | null {
  if (!policy.enabled || !priorityId) return policy.enabled ? policy.defaultHours : null;
  const specific = policy.byPriority[priorityId];
  if (Number.isFinite(specific) && specific > 0) return specific;
  return policy.defaultHours;
}

// Small TTL cache so list endpoints don't hit the settings table constantly
let cache: { policy: SlaPolicy; at: number } | null = null;
const TTL_MS = 15_000;

export function invalidateSlaPolicyCache() {
  cache = null;
}

export async function getSlaPolicy(): Promise<SlaPolicy> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.policy;
  let policy = DEFAULT_SLA_POLICY;
  try {
    const row = await db.setting.findUnique({ where: { key: "sla" } });
    if (row) policy = normalizePolicy(row.value);
  } catch {
    // settings table unavailable -> defaults
  }
  cache = { policy, at: Date.now() };
  return policy;
}

export type SlaInput = {
  dueDate?: Date | string | null;
  resolveDueAt?: Date | string | null;
  statusCategory?: string | null;
};

export function resolveDeadline(t: SlaInput, policy: SlaPolicy): Date | null {
  if (t.dueDate) return new Date(t.dueDate);
  if (!policy.enabled) return null;
  return t.resolveDueAt ? new Date(t.resolveDueAt) : null;
}

export function computeSla(
  t: SlaInput,
  policy: SlaPolicy = DEFAULT_SLA_POLICY
): { status: "breached" | "at_risk" | "on_track" | "met" | "none"; hoursOverdue: number | null; hoursLeft: number | null } {
  const deadline = resolveDeadline(t, policy);
  if (!deadline) return { status: "none", hoursOverdue: null, hoursLeft: null };
  if (t.statusCategory === "DONE") return { status: "met", hoursOverdue: null, hoursLeft: null };

  const now = Date.now();
  const due = deadline.getTime();
  if (now > due) {
    return { status: "breached", hoursOverdue: Math.floor((now - due) / 3600000), hoursLeft: null };
  }
  const hoursLeft = Math.floor((due - now) / 3600000);
  if (hoursLeft <= policy.riskHours) {
    return { status: "at_risk", hoursOverdue: null, hoursLeft };
  }
  return { status: "on_track", hoursOverdue: null, hoursLeft };
}

/**
 * One flagging pass over all breached-but-unflagged tickets (policy-aware:
 * honors both explicit due dates and priority-derived resolveDueAt targets).
 */
export async function flagBreachedTickets(limit = 200): Promise<number> {
  const policy = await getSlaPolicy();
  const now = new Date();

  const candidates = await db.ticket.findMany({
    where: {
      deletedAt: null,
      slaFlaggedAt: null,
      status: { category: { not: "DONE" } },
      OR: [
        { dueDate: { lt: now } },
        ...(policy.enabled ? [{ resolveDueAt: { lt: now } }] : []),
      ],
    },
    select: { id: true, key: true, title: true, assigneeId: true, reporterId: true, dueDate: true, resolveDueAt: true },
    orderBy: { dueDate: "asc" },
    take: limit,
  });

  let flagged = 0;
  for (const t of candidates) {
    // Re-check with exact policy math (query above is a superset)
    const deadline = resolveDeadline({ dueDate: t.dueDate, resolveDueAt: t.resolveDueAt }, policy);
    if (!deadline || deadline.getTime() >= now.getTime()) continue;

    try {
      await db.$transaction(async (tx) => {
        const res = await tx.ticket.updateMany({
          where: { id: t.id, slaFlaggedAt: null },
          data: { slaFlaggedAt: new Date() },
        });
        if (res.count === 0) return;
        await tx.ticketHistory.create({
          data: {
            ticketId: t.id,
            field: "sla",
            oldValue: "on_track",
            newValue: "breached",
            message: `SLA breached - deadline passed`,
          },
        });
        flagged += 1;
      });

      const recipients = [t.assigneeId, t.reporterId].filter((x): x is string => Boolean(x));
      for (const uid of recipients) {
        await db.notification.create({
          data: {
            userId: uid,
            type: "TICKET_OVERDUE",
            title: `SLA breached: ${t.key}`,
            body: `"${t.title}" is past its SLA deadline`,
            ticketId: t.id,
          },
        });
      }

      if (t.assigneeId) {
        const { queueEmail } = await import("@/lib/email/send");
        const { renderEmail } = await import("@/lib/email/templates");
        const assignee = await db.user.findUnique({ where: { id: t.assigneeId }, select: { email: true, firstName: true } });
        if (assignee) {
          const email = await renderEmail("ticket_overdue", {
            ticket_key: t.key,
            ticket_title: t.title,
            ticket_url: `${process.env.APP_URL ?? ""}/tickets/${t.key}`,
            assignee_name: assignee.firstName,
          });
          await queueEmail({ to: assignee.email, templateKey: "ticket_overdue", ...email, ticketId: t.id });
        }
      }
    } catch (e) {
      console.error(`[sla] failed to flag ${t.key}:`, e);
    }
  }
  return flagged;
}
