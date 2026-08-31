import { db } from "@/lib/db";
import type { EmailTemplateKey } from "@/lib/constants";
import { APP_URL } from "@/lib/config";

type Vars = Record<string, string | undefined>;

const DEFAULT_TEMPLATES: Record<EmailTemplateKey, { subject: string; body: string }> = {
  ticket_created: {
    subject: "[{{ticket_key}}] New ticket created - {{ticket_title}}",
    body: `<p>A new ticket was created in <b>{{project_name}}</b>.</p>
<table><tr><td>Ticket</td><td><a href="{{ticket_url}}">{{ticket_key}}</a></td></tr>
<tr><td>Title</td><td>{{ticket_title}}</td></tr>
<tr><td>Priority</td><td>{{priority}}</td></tr>
<tr><td>Due date</td><td>{{due_date}}</td></tr>
<tr><td>Reporter</td><td>{{reporter_name}}</td></tr></table>`,
  },
  ticket_assigned: {
    subject: "New Ticket Assigned to You - {{ticket_key}}",
    body: `<p>Hi {{assignee_name}},</p><p><b>{{actor_name}}</b> assigned a ticket to you.</p>
<table><tr><td>Ticket</td><td><a href="{{ticket_url}}">{{ticket_key}}</a></td></tr>
<tr><td>Title</td><td>{{ticket_title}}</td></tr>
<tr><td>Priority</td><td>{{priority}}</td></tr>
<tr><td>Due date</td><td>{{due_date}}</td></tr></table>
<p>Description summary:</p><blockquote>{{description_summary}}</blockquote>
<p><a href="{{ticket_url}}">Open ticket</a></p>`,
  },
  ticket_reassigned: {
    subject: "Ticket Reassigned to You - {{ticket_key}}",
    body: `<p>Hi {{assignee_name}},</p><p>Ticket <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}} has been reassigned to you by <b>{{actor_name}}</b>.</p>
<p>Priority: {{priority}} | Due: {{due_date}}</p>`,
  },
  status_changed: {
    subject: "[{{ticket_key}}] Status changed to {{new_value}}",
    body: `<p><b>{{actor_name}}</b> changed the status of <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}}.</p>
<p>{{old_value}} &rarr; <b>{{new_value}}</b></p>`,
  },
  priority_changed: {
    subject: "[{{ticket_key}}] Priority changed to {{new_value}}",
    body: `<p><b>{{actor_name}}</b> changed the priority of <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}}.</p>
<p>{{old_value}} &rarr; <b>{{new_value}}</b></p>`,
  },
  due_date_changed: {
    subject: "[{{ticket_key}}] Due date is now {{new_value}}",
    body: `<p><b>{{actor_name}}</b> changed the due date of <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}}.</p>
<p>New due date: <b>{{new_value}}</b></p>`,
  },
  comment_added: {
    subject: "[{{ticket_key}}] New comment by {{actor_name}}",
    body: `<p><b>{{actor_name}}</b> commented on <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}}:</p>
<blockquote>{{comment_body}}</blockquote>`,
  },
  mention: {
    subject: "{{actor_name}} mentioned you - {{ticket_key}}",
    body: `<p><b>{{actor_name}}</b> mentioned you on <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}}:</p>
<blockquote>{{comment_body}}</blockquote>`,
  },
  ticket_resolved: {
    subject: "[{{ticket_key}}] Resolved - {{ticket_title}}",
    body: `<p><a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}} was marked resolved by <b>{{actor_name}}</b>.</p>`,
  },
  ticket_reopened: {
    subject: "[{{ticket_key}}] Reopened - {{ticket_title}}",
    body: `<p><b>{{actor_name}}</b> reopened <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}}.</p>`,
  },
  ticket_overdue: {
    subject: "[{{ticket_key}}] Overdue reminder - {{ticket_title}}",
    body: `<p>This is a reminder that <a href="{{ticket_url}}">{{ticket_key}}</a> - {{ticket_title}} is past its due date of {{due_date}}.</p>`,
  },
  user_invitation: {
    subject: "You have been invited to TicketBooks",
    body: `<p>Hi {{first_name}},</p><p>An account has been created for you on TicketBooks.</p>
<p>Sign in at <a href="{{login_url}}">{{login_url}}</a> with your work email.</p>`,
  },
  otp_verification: {
    subject: "Your TicketBooks verification code is {{otp_code}}",
    body: `<p>Hi {{first_name}},</p>
<p>Your verification code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:16px;margin:16px 0">{{otp_code}}</p>
<p>This code expires in <b>{{expires_minutes}} minutes</b>. Do not share it with anyone.</p>
<p style="color:#64748b;font-size:12px">If you didn't request this, you can safely ignore this email.</p>`,
  },
  email_verification: {
    subject: "Verify your email - {{otp_code}}",
    body: `<p>Hi {{first_name}},</p>
<p>Use this code to verify your email address:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:16px;margin:16px 0">{{otp_code}}</p>
<p>Expires in {{expires_minutes}} minutes.</p>`,
  },
  password_reset_otp: {
    subject: "Reset your password - code {{otp_code}}",
    body: `<p>Hi {{first_name}},</p>
<p>You requested to reset your password. Use this OTP to proceed:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:8px;padding:16px;margin:16px 0">{{otp_code}}</p>
<p>This code expires in <b>{{expires_minutes}} minutes</b>.</p>
<p style="color:#64748b;font-size:12px">If you didn't request a reset, ignore this email.</p>`,
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fillVars(template: string, vars: Vars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function fillVarsEscaped(template: string, vars: Vars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v != null ? escapeHtml(v) : "";
  });
}

function pageWrap(title: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
<div style="background:#18181b;color:#fff;padding:14px 20px;font-weight:600;font-size:15px">TICKETBOOKS &nbsp;<span style="opacity:.8;font-weight:400">${title}</span></div>
<div style="padding:20px;font-size:14px;line-height:1.6">${inner}</div>
<div style="padding:12px 20px;background:#f8fafc;color:#64748b;font-size:12px">Sent by TicketBooks Work Management</div>
</div></body></html>`;
}

/** Renders a template by key using DB overrides (settings.templates) falling back to defaults */
export async function renderEmail(
  key: EmailTemplateKey,
  vars: Vars
): Promise<{ subject: string; html: string }> {
  const settingsRow = await db.setting.findUnique({ where: { key: "templates" } }).catch(() => null);
  const overrides = ((settingsRow?.value as Record<string, { subject?: string; body?: string }>) ?? {})[key];
  const tpl = { subject: overrides?.subject ?? DEFAULT_TEMPLATES[key].subject, body: overrides?.body ?? DEFAULT_TEMPLATES[key].body };
  const varsWithDefaults = {
    ticket_url: `${APP_URL}/tickets/`,
    login_url: `${APP_URL}/login`,
    ...vars,
  };
  return {
    subject: fillVars(tpl.subject, varsWithDefaults), // subject is plain text, no html escape needed
    html: pageWrap(key.replaceAll("_", " "), fillVarsEscaped(`<p>${tpl.body}</p>`, varsWithDefaults)),
  };
}
