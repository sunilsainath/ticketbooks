import { after } from "next/server";

/**
 * Opportunistic background scanner for serverless hosts:
 * piggybacks the SLA breach pass + email retries onto normal app traffic,
 * throttled to at most one run per 5 minutes per instance. This keeps
 * flagging near-realtime even on plans where frequent crons aren't allowed
 * (Vercel Hobby). Explicit schedulers (Vercel Pro cron / GitHub Actions /
 * self-hosted intervals) continue to work via /api/cron.
 */

const THROTTLE_MS = 5 * 60_000;
const g = globalThis as unknown as { __strikeLastScan?: number };

export function maybeRunBackgroundScan() {
  const last = g.__strikeLastScan ?? 0;
  if (Date.now() - last < THROTTLE_MS) return;
  g.__strikeLastScan = Date.now();

  after(async () => {
    try {
      const [{ flagBreachedTickets }, { retryPendingEmails }] = await Promise.all([
        import("@/lib/sla"),
        import("@/lib/email/send"),
      ]);
      const [flagged, retried] = await Promise.all([flagBreachedTickets(), retryPendingEmails()]);
      if (flagged > 0 || retried > 0) {
        console.log(`[bg] opportunistic scan: flagged ${flagged}, retried ${retried}`);
      }
    } catch (e) {
      console.error("[bg] opportunistic scan failed:", e);
    }
  });
}
