import { db } from "@/lib/db";
import { getMailProvider, type MailMessage } from "./provider";
import type { EmailTemplateKey } from "@/lib/constants";

/**
 * Queued, best-effort email delivery:
 * 1. Persist an EmailEvent row (PENDING) - durable record even if send fails.
 * 2. Attempt delivery; on failure mark FAILED with backoff for retry.
 * Callers must NEVER let email failures break business actions.
 */

const MAX_ATTEMPTS = 5;

export async function queueEmail(opts: {
  to: string | null | undefined;
  templateKey: EmailTemplateKey;
  subject: string;
  html: string;
  ticketId?: string | null;
}) {
  if (!opts.to) return;
  const row = await db.emailEvent.create({
    data: {
      ticketId: opts.ticketId ?? null,
      direction: "OUTBOUND",
      recipients: opts.to,
      subject: opts.subject,
      body: opts.html,
      templateKey: opts.templateKey,
      status: "PENDING",
      attempts: 0,
    },
  });
  // Fire-and-forget: never block the request path
  void attemptSend(row.id);
}

export async function attemptSend(emailEventId: string): Promise<boolean> {
  const row = await db.emailEvent.findUnique({ where: { id: emailEventId } });
  if (!row || row.status === "SENT") return false;

  const setting = await db.setting.findUnique({ where: { key: "email" } }).catch(() => null);
  const provider = await getMailProvider(setting?.value);
  const from = ((setting?.value as { from?: string }) ?? {}).from;

  const msg: MailMessage = { to: row.recipients!, subject: row.subject, html: row.body ?? "", from };
  try {
    const res = await provider.send(msg);
    await db.emailEvent.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), provider: provider.name, messageId: res.messageId, error: null, nextRetryAt: null },
    });
    return true;
  } catch (err) {
    const attempts = (row.attempts ?? 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(60 * Math.pow(2, attempts), 1440); // capped exponential
    await db.emailEvent.update({
      where: { id: row.id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        attempts,
        error: err instanceof Error ? err.message : "Unknown email error",
        provider: provider.name,
        nextRetryAt: exhausted ? null : new Date(Date.now() + backoffMinutes * 60000),
      },
    });
    console.error(`[email] delivery failed (attempt ${attempts}) for ${row.templateKey} -> ${row.recipients}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Retry loop for failed/pending emails; safe to call concurrently */
export async function retryPendingEmails(): Promise<number> {
  const due = await db.emailEvent.findMany({
    where: {
      status: "PENDING",
      direction: "OUTBOUND",
      attempts: { lt: 5 },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    take: 20,
  });
  let sent = 0;
  for (const row of due) {
    if (await attemptSend(row.id)) sent += 1;
  }
  return sent;
}
