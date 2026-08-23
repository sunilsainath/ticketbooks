import { db } from "@/lib/db";
import { authRoute, ok } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can, PERMISSION_CATALOG, type SessionUser } from "@/lib/rbac";

function guard(user: SessionUser) {
  if (!can(user, "user.manage") && !can(user, "*")) throw forbidden();
}

export const GET = authRoute(async (_req, user) => {
  guard(user);
  const roles = await db.role.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return ok({ roles, catalog: PERMISSION_CATALOG });
});
