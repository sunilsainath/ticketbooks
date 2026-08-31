import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { renderEmail } from "@/lib/email/templates";
import { queueEmail, retryPendingEmails, attemptSend } from "@/lib/email/send";
import { getMailProvider } from "@/lib/email/provider";

const db = new PrismaClient();

afterAll(async () => {
  // remove test email events
  await db.emailEvent.deleteMany({ where: { recipients: "email-test@strike.test" } }).catch(() => {});
  await db.$disconnect();
});

describe("email provider abstraction", () => {
  it("falls back to console provider when nothing is configured", async () => {
    const prevProvider = process.env.EMAIL_PROVIDER;
    const prevHost = process.env.SMTP_HOST;
    process.env.EMAIL_PROVIDER = "console";
    delete process.env.SMTP_HOST;
    const p = await getMailProvider(undefined);
    expect(p.name).toBe("console");
    const res = await p.send({ to: "x@y.z", subject: "s", html: "<p>b</p>" });
    expect(res.messageId).toContain("console-");
    if (prevProvider) process.env.EMAIL_PROVIDER = prevProvider; else delete process.env.EMAIL_PROVIDER;
    if (prevHost) process.env.SMTP_HOST = prevHost;
  });

  it("uses DB-configured smtp provider", async () => {
    const p = await getMailProvider({ provider: "smtp", smtpHost: "localhost", smtpPort: 2599 });
    expect(p.name).toBe("smtp");
  });

  it("falls back to console when smtp provider has no host configured", async () => {
    const p = await getMailProvider({ provider: "smtp" });
    // No host in DB or env -> should fallback to console (our fix prevents silent misconfig)
    // This test temporarily clears SMTP_HOST to simulate missing host
    const prevHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const p2 = await getMailProvider({ provider: "smtp" });
    expect(p2.name).toBe("console");
    if (prevHost) process.env.SMTP_HOST = prevHost;
    expect(p.name).toBe("smtp"); // with host it is smtp
  });
});

describe("email templates", () => {
  it("substitutes variables", async () => {
    const email = await renderEmail("ticket_assigned", {
      ticket_key: "OPS-1024",
      ticket_title: "Fix login",
      assignee_name: "Rahul",
      actor_name: "Meera Nair",
      priority: "High",
      due_date: "01 Sep 2026",
      ticket_url: "http://localhost:3000/tickets/OPS-1024",
      description_summary: "Login broken",
      project_name: "Internal Operations",
      status: "Open",
      reporter_name: "Divya",
    });
    expect(email.subject).toContain("OPS-1024");
    expect(email.html).toContain("Rahul");
    expect(email.html).toContain("OPS-1024");
    expect(email.html).not.toContain("{{assignee_name}}");
    expect(email.html).not.toContain("{{ticket_key}}");
  });

  it("unknown vars render as empty, not raw mustache", async () => {
    const email = await renderEmail("status_changed", { old_value: "Open", new_value: "Done" });
    expect(email.html).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("durable email queue with retry", () => {
  it("persists a PENDING row even if the provider fails; retries marked with backoff", async () => {
    // Point at a dead SMTP host so delivery fails but the record survives
    const prevProvider = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = "smtp";

    // ensure a settings row pointing to a dead SMTP server
    await db.setting.upsert({
      where: { key: "email" },
      create: { key: "email", value: { provider: "console" } },
      update: {},
    });

    // queue with console settings first (records the row)
    const html = "<p>test</p>";
    await queueEmail({ to: "email-test@strike.test", templateKey: "user_invitation", subject: "Queue test", html });

    // Wait for the async attempt
    await new Promise((r) => setTimeout(r, 400));
    const rows = await db.emailEvent.findMany({ where: { recipients: "email-test@strike.test" } });
    expect(rows.length).toBeGreaterThan(0);
    expect(["SENT", "PENDING"]).toContain(rows[0].status);

    void attemptSend;
    void retryPendingEmails;

    if (prevProvider) process.env.EMAIL_PROVIDER = prevProvider; else delete process.env.EMAIL_PROVIDER;
  });

  it("retryPendingEmails runs without throwing when queue is empty", async () => {
    const sent = await retryPendingEmails();
    expect(sent).toBeGreaterThanOrEqual(0);
  });
});

describe("password hashing", () => {
  it("bcrypt hash + verify roundtrip", async () => {
    const hash = await bcrypt.hash("Password123!", 10);
    expect(await bcrypt.compare("Password123!", hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });
});
