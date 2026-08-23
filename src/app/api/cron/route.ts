import { ok, publicRoute } from "@/lib/api";
import { unauthorized } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Background jobs entry point for scheduled runners (Vercel Cron / GitHub Actions).
 * Vercel Cron automatically sends `Authorization: Bearer ${CRON_SECRET}` when the
 * CRON_SECRET env var is configured; external schedulers must send it manually.
 */
async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) throw unauthorized("Invalid cron secret");

  const { flagBreachedTickets } = await import("@/lib/sla");
  const { retryPendingEmails } = await import("@/lib/email/send");

  const [flagged, emailsRetried] = await Promise.all([flagBreachedTickets(), retryPendingEmails()]);
  return ok({ ok: true, at: new Date().toISOString(), slaFlagged: flagged, emailsRetried });
}

export const GET = publicRoute(handler);
export const POST = publicRoute(handler);
