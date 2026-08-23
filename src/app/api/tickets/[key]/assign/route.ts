import { z } from "zod";
import { authRoute, parseBody, ok } from "@/lib/api";
import { assignTicket } from "@/lib/tickets/service";

type Ctx = { params: Promise<{ key: string }> };

export const POST = authRoute(async (req, user, ctx: Ctx) => {
  const { key } = await ctx.params;
  const data = await parseBody(req, z.object({ assigneeId: z.string().nullable() }));
  const updated = await assignTicket(user, key, data.assigneeId || null);
  return ok(updated);
});
