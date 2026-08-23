import { publicRoute, ok } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export const POST = publicRoute(async () => {
  const { getSessionUser } = await import("@/lib/auth/session");
  const me = await getSessionUser();
  await destroySession();
  if (me) {
    const { audit } = await import("@/lib/history");
    await audit({ userId: me.id, action: "LOGOUT", entityType: "Session" });
  }
  return ok({ success: true });
});
