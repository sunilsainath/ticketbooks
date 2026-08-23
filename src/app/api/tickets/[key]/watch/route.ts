import { authRoute, ok } from "@/lib/api";
import { setWatching } from "@/lib/tickets/service";

type Ctx = { params: Promise<{ key: string }> };

export const POST = authRoute(async (_req, user, ctx: Ctx) => {
  const { key } = await ctx.params;
  await setWatching(user, key, true);
  return ok({ watching: true });
});

export const DELETE = authRoute(async (_req, user, ctx: Ctx) => {
  const { key } = await ctx.params;
  await setWatching(user, key, false);
  return ok({ watching: false });
});
