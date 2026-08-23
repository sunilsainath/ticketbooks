import { db } from "@/lib/db";
import { publicRoute, parseBody, ok } from "@/lib/api";
import { z } from "zod";
import { randomToken, sha256 } from "@/lib/auth/password";
import { queueEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/email/templates";

/** Always returns success to avoid account enumeration */
export const POST = publicRoute(
  async (req) => {
    void req;
    const { email } = await parseBody(req, z.object({ email: z.string().email() }));

    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user && user.status !== "DISABLED") {
      const token = randomToken();
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) },
      });
      const link = `${process.env.APP_URL}/reset-password?token=${token}`;
      const rendered = await renderEmail("user_invitation", {
        first_name: user.firstName,
        login_url: link,
      });
      await queueEmail({
        to: user.email,
        templateKey: "user_invitation",
        subject: "TicketBooks - Reset your password",
        html: `<p>Hi ${user.firstName},</p><p>Click the link below to reset your password. It expires in one hour.</p><p><a href="${link}">Reset password</a></p><p style="color:#64748b;font-size:12px">${link}</p>${rendered.html}`,
      });
    }
    return ok({ success: true });
  },
  { n: 5, ms: 60_000 }
);
