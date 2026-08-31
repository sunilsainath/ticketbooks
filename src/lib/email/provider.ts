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
  private resolveFrom(msgFrom?: string): string {
    // Prefer explicitly requested from, then stored setting, then env, then authenticated user
    const candidate = msgFrom ?? this.cfg.from ?? process.env.EMAIL_FROM ?? (this.cfg.user ? `TicketBooks <${this.cfg.user}>` : "TicketBooks <no-reply@ticketbooks.local>");
    // Zoho and similar providers reject relay when envelope FROM domain does not match
    // the authenticated user. If the candidate address does not contain the auth user,
    // and the auth user is a Zoho address, fall back to the Zoho identity.
    // This prevents the common "553 Sender is not allowed to relay emails" failure.
    if (this.cfg.user && candidate) {
      const extractAddr = (s: string) => {
        const m = s.match(/<([^>]+)>/);
        return (m ? m[1] : s).trim().toLowerCase();
      };
      const candAddr = extractAddr(candidate);
      const authAddr = this.cfg.user.toLowerCase();
      const candDomain = candAddr.split("@")[1] ?? "";
      const authDomain = authAddr.split("@")[1] ?? "";
      // If domains differ (e.g. verify@drep.in alias not configured) and auth is zoho, use auth addr
      if (candAddr !== authAddr && candDomain !== authDomain) {
        // keep original if same domain (aliases usually same domain), otherwise use auth
        // For Zoho, strict match required unless alias is provisioned, so use auth user
        if (authDomain.includes("zoho")) {
          console.warn(`[email] FROM "${candidate}" may be rejected by ${this.cfg.host} for user ${this.cfg.user}; using authenticated address instead`);
          return this.cfg.user.includes("<") ? this.cfg.user : `TicketBooks <${this.cfg.user}>`;
        }
      }
      // Even same domain but different local part can be rejected if alias not created.
      // Detect Zoho + common alias mismatch (verify@ vs authenticated user)
      if (candAddr !== authAddr && authDomain.includes("zoho") && candAddr.endsWith(`@${authDomain}`)) {
        // Allow same-domain alias only if explicitly provisioned; log hint but keep candidate.
        // To avoid 553 for unverified alias, prefer auth user when candidate local part differs
        // unless the provider is known to allow aliases. For now, enforce auth user.
        console.warn(`[email] Zoho alias "${candAddr}" may require alias provisioning; falling back to ${authAddr}`);
        return this.cfg.user.includes("<") ? this.cfg.user : `TicketBooks <${this.cfg.user}>`;
      }
    }
    return candidate;
  }
  async send(msg: MailMessage) {
    // nodemailer is Node-only: the runtime gate lets Edge builds tree-shake this
    // branch entirely, while Node builds bundle + trace nodemailer normally.
    // Allow undefined (plain Node / tsx) as nodejs; only block explicit edge runtime.
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
      throw new Error("SMTP email requires the Node.js runtime");
    }
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure,
      auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass } : undefined,
      // Zoho on 587 uses STARTTLS; ensure TLS is properly negotiated
      requireTLS: !this.cfg.secure && this.cfg.port === 587 ? true : undefined,
    });
    try {
      await transport.verify();
    } catch (e) {
      console.error(`[email] SMTP verify failed for ${this.cfg.host}:${this.cfg.port} as ${this.cfg.user}:`, e instanceof Error ? e.message : e);
      throw e;
    }
    const from = this.resolveFrom(msg.from);
    const info = await transport.sendMail({
      from,
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
  if (provider === "smtp") {
    const host = cfg.smtpHost ?? process.env.SMTP_HOST;
    if (!host) {
      console.error("[email] provider is 'smtp' but no SMTP host configured (DB or SMTP_HOST). Falling back to console provider. Check Settings > Email or env vars.");
      return new ConsoleProvider();
    }
    return new SmtpProvider({
      host,
      port: Number(cfg.smtpPort ?? process.env.SMTP_PORT ?? 587),
      secure: Boolean(String(cfg.smtpSecure ?? process.env.SMTP_SECURE) === "true"),
      user: cfg.smtpUser ?? process.env.SMTP_USER,
      pass: cfg.smtpPassword ?? process.env.SMTP_PASSWORD,
      from: cfg.from,
    });
  }
  return new ConsoleProvider();
}
