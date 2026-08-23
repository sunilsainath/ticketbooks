import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { readObject } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

/** Authorized attachment download: only users who can see the parent ticket */
export const GET = authRoute(async (_req, user, ctx: Ctx) => {
  const { id } = await ctx.params;
  const a = await db.attachment.findUnique({
    where: { id },
    include: {
      ticket: {
        select: {
          id: true,
          assigneeId: true,
          reporterId: true,
          project: { select: { teamId: true } },
        },
      },
    },
  });
  if (!a || !a.ticket) throw notFound("Attachment not found");

  const t = a.ticket;
  const allowed =
    user.permissions.includes("*") ||
    t.assigneeId === user.id ||
    t.reporterId === user.id ||
    (user.teamId && t.project.teamId === user.teamId) ||
    user.managedTeamIds.includes(t.project.teamId ?? "__none__");
  if (!allowed) {
    // fallback: watchers and commenters on this ticket may also download
    const [watcher, commenter] = await Promise.all([
      db.ticketWatcher.findFirst({ where: { ticketId: t.id, userId: user.id } }),
      db.comment.findFirst({ where: { ticketId: t.id, authorId: user.id, deletedAt: null } }),
    ]);
    if (!watcher && !commenter) throw notFound("Attachment not found");
  }

  try {
    const data = await readObject(a.storagePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Length": String(a.size),
        "Content-Disposition": `attachment; filename="${a.fileName.replace(/["\\]/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    throw notFound("File data is missing from storage");
  }
});
