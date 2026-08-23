import { authRoute, ok } from "@/lib/api";
import { claimTicket } from "@/lib/tickets/service";

type Ctx = { params: Promise<{ key: string }> };

export const POST = authRoute(async (_req, user, ctx: Ctx) => {
  const { key } = await ctx.params;
  const updated = await claimTicket(user, key);
  return ok(updated);
});
