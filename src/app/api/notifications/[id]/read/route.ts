import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";
import { notFound } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authRoute(async (_req, user, ctx: Ctx) => {
  const { id } = await ctx.params;
  const n = await db.notification.findUnique({ where: { id } });
  if (!n || n.userId !== user.id) throw notFound("Notification not found");
  const updated = await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return ok(updated);
});
