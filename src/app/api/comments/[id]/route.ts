import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, notFound } from "@/lib/errors";
import { recordHistory } from "@/lib/history";
import { stripHtml, excerpt } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authRoute(async (req, user, ctx: Ctx) => {
  const { id } = await ctx.params;
  const data = await parseBody(req, z.object({ body: z.string().min(1).max(20000) }));
  const comment = await db.comment.findUnique({ where: { id }, include: { ticket: { select: { key: true } } } });
  if (!comment || comment.deletedAt) throw notFound("Comment not found");
  if (comment.authorId !== user.id && !user.permissions.includes("*")) throw forbidden("You can only edit your own comments");

  const updated = await db.comment.update({ where: { id }, data: { body: data.body, editedAt: new Date() } });
  await recordHistory(db, { ticketId: comment.ticketId, userId: user.id, field: "comment", oldValue: excerpt(stripHtml(comment.body), 80), newValue: excerpt(stripHtml(data.body), 80), message: "Comment edited" });
  void comment.ticket.key;
  return ok(updated);
});

export const DELETE = authRoute(async (_req, user, ctx: Ctx) => {
  const { id } = await ctx.params;
  const comment = await db.comment.findUnique({ where: { id } });
  if (!comment || comment.deletedAt) throw notFound("Comment not found");
  const isMod = user.permissions.includes("*") || user.permissions.includes("ticket.edit.team");
  if (comment.authorId !== user.id && !isMod) throw forbidden("You can only delete your own comments");

  // Soft-delete preserves audit trail
  await db.$transaction(async (tx) => {
    await tx.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordHistory(tx, { ticketId: comment.ticketId, userId: user.id, field: "comment", oldValue: excerpt(stripHtml(comment.body), 80), newValue: null, message: "Comment deleted" });
  });
  return ok({ success: true });
});
