/**
 * Server bootstrap hooks.
 *
 * On long-running hosts this starts in-process intervals for the SLA breach
 * scanner and email retries. On serverless platforms (Vercel sets VERCEL=1)
 * background intervals do not survive between invocations - schedule
 * GET /api/cron instead (see vercel.json / .github/workflows/sla-cron.yml).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL === "1") return;

  const { retryPendingEmails } = await import("@/lib/email/send");
  const { flagBreachedTickets } = await import("@/lib/sla");

  const slaPass = () =>
    flagBreachedTickets().catch((e) => console.error("[worker] sla scan failed:", e));

  void slaPass(); // flag immediately on boot
  setInterval(slaPass, 300_000); // then every 5 minutes

  setInterval(() => {
    retryPendingEmails().catch((e) => console.error("[worker] email retry failed:", e));
  }, 120_000);
}
