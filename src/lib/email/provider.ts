import type { MailMessage } from "./types";

export type { MailMessage };

export interface MailProvider {
  name: string;
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

class ConsoleProvider implements MailProvider {
  name = "console";
  async send(msg: MailMessage) {
    console.log(
      `\n[email:console] --------------------------------------------------\n` +
        `To: ${msg.to}\nSubject: ${msg.subject}\n${msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)}\n` +
        `-------------------------------------------------------------------\n`
    );
    return { messageId: `console-${Date.now()}` };
  }
}

class SmtpProvider implements MailProvider {
  name = "smtp";
  private cfg;
  constructor(cfg: { host: string; port: number; secure: boolean; user?: string; pass?: string; from?: string }) {
    this.cfg = cfg;
  }
  async send(msg: MailMessage) {
    // nodemailer is a Node-only package - loaded at runtime so bundlers never inline it
    const nodemailer = await import(/* webpackIgnore: true */ "nodemailer" as string);
    const transport = nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure,
      auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass } : undefined,
    });
    const info = await transport.sendMail({
      from: msg.from ?? this.cfg.from ?? process.env.EMAIL_FROM ?? "TicketBooks <no-reply@ticketbooks.local>",
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });
    return { messageId: info.messageId };
  }
}

/**
 * Provider resolution order:
 * 1. DB setting "email" (configured by admin in Settings > Email)
 * 2. EMAIL_PROVIDER env var ("smtp" builds SmtpProvider)
 * 3. Console fallback so app actions never fail because of email
 */
export async function getMailProvider(dbSetting?: unknown): Promise<MailProvider> {
  const cfg = (dbSetting as { provider?: string; smtpHost?: string; smtpPort?: number; smtpSecure?: boolean; smtpUser?: string; smtpPassword?: string; from?: string } | undefined) ?? {};

  const provider = cfg.provider || process.env.EMAIL_PROVIDER || "console";
  if (provider === "smtp" && (cfg.smtpHost || process.env.SMTP_HOST)) {
    return new SmtpProvider({
      host: cfg.smtpHost ?? process.env.SMTP_HOST!,
      port: Number(cfg.smtpPort ?? process.env.SMTP_PORT ?? 587),
      secure: Boolean(String(cfg.smtpSecure ?? process.env.SMTP_SECURE) === "true"),
      user: cfg.smtpUser ?? process.env.SMTP_USER,
      pass: cfg.smtpPassword ?? process.env.SMTP_PASSWORD,
      from: cfg.from,
    });
  }
  return new ConsoleProvider();
}
