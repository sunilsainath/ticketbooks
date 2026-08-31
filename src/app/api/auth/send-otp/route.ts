import { z } from "zod";
import { db } from "@/lib/db";
import { publicRoute, parseBody, ok } from "@/lib/api";
import { generateOtp, hashOtp, otpExpiryMinutes, OTP_TTL_MINUTES, OTP_RESEND_COOLDOWN_MS } from "@/lib/auth/otp";
import { queueEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/email/templates";

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(["email_verification", "password_reset"]).optional().default("email_verification"),
  firstName: z.string().optional(), // optional override for greeting
});

// Simple in-memory cooldown per email to prevent spam (also persisted check below)
const cooldown = new Map<string, number>();

export const POST = publicRoute(
  async (req) => {
    const { email: rawEmail, purpose, firstName: providedFirstName } = await parseBody(req, schema);
    const email = rawEmail.toLowerCase().trim();

    // Throttle: 60s cooldown per email+purpose
    const key = `${email}:${purpose}`;
    const last = cooldown.get(key) ?? 0;
    if (Date.now() - last < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000);
      return ok({ success: false, reason: `Please wait ${wait}s before requesting another code.` }, { status: 429 });
    }

    // DB cooldown: check latest OtpToken created within 60s
    const recent = await db.otpToken.findFirst({
      where: { email, purpose, createdAt: { gte: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      const wait = Math.ceil((recent.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000);
      return ok({ success: false, reason: `Please wait ${wait}s before requesting another code.` }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { email } });
    const firstName = providedFirstName ?? user?.firstName ?? email.split("@")[0];

    // Invalidate older unused OTPs for same email/purpose (keep history but expire them)
    await db.otpToken.updateMany({
      where: { email, purpose, verifiedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() }, // expire immediately so only latest is valid
    });

    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const expiresAt = otpExpiryMinutes(OTP_TTL_MINUTES);

    await db.otpToken.create({
      data: { email, otpHash, purpose, expiresAt },
    });

    // Choose template based on purpose
    const templateKey = purpose === "password_reset" ? "password_reset_otp" : "otp_verification";
    const rendered = await renderEmail(templateKey as never, {
      first_name: firstName,
      otp_code: otp,
      expires_minutes: String(OTP_TTL_MINUTES),
    });

    // Log OTP to server console in development or when email provider is console,
    // so dev can retrieve code without needing SMTP to work.
    const isDev = process.env.NODE_ENV !== "production";
    const emailSetting = await db.setting.findUnique({ where: { key: "email" } }).catch(() => null);
    const provider = (emailSetting?.value as { provider?: string })?.provider ?? process.env.EMAIL_PROVIDER ?? "console";
    if (isDev || provider === "console") {
      console.log(`\n[otp:console] To: ${email} Purpose: ${purpose} Code: ${otp} Expires: ${expiresAt.toISOString()}\n`);
    }

    await queueEmail({
      to: email,
      templateKey: templateKey as never,
      subject: rendered.subject,
      html: rendered.html,
    });

    cooldown.set(key, Date.now());

    // Don't leak OTP in response except in non-production for debugging
    const response: Record<string, unknown> = { success: true, expiresAt, purpose };
    if (isDev) {
      response.devOtp = otp; // helpful for local testing; remove in prod
      response.note = `OTP logged to server console. Email provider: ${provider}. Check EmailEvent table for delivery status.`;
    }

    return ok(response);
  },
  { n: 5, ms: 60_000 }
);
