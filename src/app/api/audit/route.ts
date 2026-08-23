import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";

export const GET = authRoute(async (req, user) => {
  if (!can(user, "audit.view") && !can(user, "*")) throw forbidden();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const q = url.searchParams.get("q")?.trim();
  const action = url.searchParams.get("action");
  const pageSize = 50;

  const logs = await db.auditLog.findMany({
    where: {
      AND: [
        action ? { action: { contains: action.toUpperCase() } } : {},
        q ? {
          OR: [
            { entityType: { contains: q, mode: "insensitive" as const } },
            { user: { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } },
          ],
        } : {},
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  });
  const hasMore = logs.length > pageSize;
  return ok({ items: logs.slice(0, pageSize), page, hasMore });
});
