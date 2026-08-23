import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { addComment } from "@/lib/tickets/service";

type Ctx = { params: Promise<{ key: string }> };

export const GET = authRoute(async (_req, _user, ctx: Ctx) => {
  const { key } = await ctx.params;
  void db;
  const ticket = await db.ticket.findFirst({ where: { key: key.toUpperCase(), deletedAt: null }, select: { id: true } });
  if (!ticket) return ok({ comments: [] });
  const comments = await db.comment.findMany({
    where: { ticketId: ticket.id, deletedAt: null },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
      attachments: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return ok({ comments });
});

export const POST = authRoute(async (req, user, ctx: Ctx) => {
  const { key } = await ctx.params;
  const data = await parseBody(req, z.object({
    body: z.string().min(1).max(20000),
    parentId: z.string().nullable().optional(),
  }));
  const comment = await addComment(user, key, data.body, data.parentId ?? null);
  return ok(comment, { status: 201 });
});
