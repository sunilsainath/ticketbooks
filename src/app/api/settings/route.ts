import { z } from "zod";
import { db } from "@/lib/db";
import { authRoute, parseBody, ok } from "@/lib/api";
import { forbidden, badRequest } from "@/lib/errors";

const SETTING_KEYS = ["organization", "email", "security", "templates", "automation", "sla"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

export const GET = authRoute(async (_req, user) => {
  const rows = await db.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // Non-admins only need their own preferences + org name
  if (!user.permissions.includes("*") && !user.permissions.includes("settings.manage")) {
    return ok({ organization: map.organization, security: { passwordMinLength: (map.security as { passwordMinLength?: number })?.passwordMinLength ?? 10 } });
  }
  return ok(map);
});

const slaPolicySchema = z.object({
  enabled: z.boolean().optional().default(true),
  riskHours: z.coerce.number().min(1).max(720).optional().default(24),
  defaultHours: z.coerce.number().min(1).max(8760).nullable().optional().default(null),
  byPriority: z.record(z.string(), z.coerce.number().min(1).max(8760)).optional().default({}),
});

const schema = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.unknown(),
});

export const PATCH = authRoute(async (req, user) => {
  if (!user.permissions.includes("*") && !user.permissions.includes("settings.manage")) throw forbidden();
  const { key, value } = await parseBody(req, schema);

  let stored: object;
  if (key === "sla") {
    // Strict validation + normalization for the SLA policy
    const parsed = slaPolicySchema.safeParse(value);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw badRequest(`Invalid SLA policy: ${first ? `${first.path.join(".") || "input"}: ${first.message}` : "malformed"}`);
    }
    stored = parsed.data as unknown as Record<string, unknown>;
  } else {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw badRequest("Setting value must be an object");
    stored = value as Record<string, unknown>;
  }

  await db.setting.upsert({
    where: { key },
    create: { key, value: stored },
    update: { value: stored },
  });

  if (key === "sla") {
    const { invalidateSlaPolicyCache } = await import("@/lib/sla");
    invalidateSlaPolicyCache();
  }

  await db.auditLog.create({ data: { userId: user.id, action: "SETTINGS_UPDATED", entityType: "Setting", entityId: key } });

  // Apply email provider changes immediately by warming the provider
  if (key === "email") {
    const { getMailProvider } = await import("@/lib/email/provider");
    await getMailProvider(value);
  }
  return ok({ success: true });
});
