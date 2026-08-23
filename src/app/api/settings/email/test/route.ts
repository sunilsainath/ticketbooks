import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";

export const POST = authRoute(async (_req, user) => {
  const setting = await db.setting.findUnique({ where: { key: "email" } });
  const cfg = (setting?.value as { provider?: string; testRecipient?: string }) ?? {};
  const to = cfg.testRecipient || user.email;

  const { queueEmail } = await import("@/lib/email/send");
  const html = `<p>This is a test email from TicketBooks.</p><p>If you received this message, your email configuration works.</p><p>Provider configured: <b>${cfg.provider ?? "console"}</b></p>`;
  await queueEmail({ to, templateKey: "user_invitation", subject: "TicketBooks - Test email", html });

  return ok({ queued: true, recipient: to, note: "Check the Email Events log for delivery status. With the 'console' provider emails are printed to the server log." });
});
