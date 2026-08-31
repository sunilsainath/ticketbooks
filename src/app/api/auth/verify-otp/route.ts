import { z } from "zod";
import { db } from "@/lib/db";
import { publicRoute, parseBody, ok } from "@/lib/api";
import { hashOtp, OTP_MAX_ATTEMPTS } from "@/lib/auth/otp";

const schema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
  purpose: z.enum(["email_verification", "password_reset"]).optional().default("email_verification"),
});

export const POST = publicRoute(
  async (req) => {
    const { email: rawEmail, otp, purpose } = await parseBody(req, schema);
    const email = rawEmail.toLowerCase().trim();
    const otpHash = hashOtp(otp.trim());

    // Find latest valid token for this email+purpose
    const token = await db.otpToken.findFirst({
      where: { email, purpose, verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!token) {
      return ok({ success: false, reason: "No verification code found. Please request a new one." }, { status: 400 });
    }

    if (token.expiresAt < new Date()) {
      return ok({ success: false, reason: "This code has expired. Please request a new one." }, { status: 400 });
    }

    if (token.attempts >= OTP_MAX_ATTEMPTS) {
      return ok({ success: false, reason: "Too many incorrect attempts. Please request a new code." }, { status: 429 });
    }

    if (token.otpHash !== otpHash) {
      await db.otpToken.update({ where: { id: token.id }, data: { attempts: token.attempts + 1 } });
      const remaining = OTP_MAX_ATTEMPTS - (token.attempts + 1);
      return ok(
        { success: false, reason: `Incorrect code. ${remaining > 0 ? `${remaining} attempt(s) left.` : "No attempts left - request a new code."}` },
        { status: 400 }
      );
    }

    // Success: mark verified
    await db.otpToken.update({ where: { id: token.id }, data: { verifiedAt: new Date(), attempts: token.attempts + 1 } });

    // If user exists, mark emailVerifiedAt and possibly activate
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), status: user.status === "INVITED" ? "ACTIVE" : user.status },
      });
      await db.auditLog.create({
        data: { userId: user.id, action: "EMAIL_VERIFIED_OTP", entityType: "User", entityId: user.id, metadata: { purpose, email } },
      });
    }

    return ok({ success: true, verified: true, purpose, email });
  },
  { n: 10, ms: 60_000 }
);
