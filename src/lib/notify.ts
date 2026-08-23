import { db } from "@/lib/db";
import { publish } from "@/lib/events";
import { NOTIF_TYPES } from "@/lib/constants";

type NotifyInput = {
  userIds: (string | null | undefined)[];
  actorId?: string | null;
  type: keyof typeof NOTIF_TYPES;
  title: string;
  body?: string;
  ticketId?: string | null;
};

/** Creates in-app notifications + pushes realtime events. Excludes the actor themself. */
export async function notify(input: NotifyInput) {
  const targets = [...new Set(input.userIds.filter((id): id is string => Boolean(id) && id !== input.actorId))];
  if (!targets.length) return;
  await db.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      actorId: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      ticketId: input.ticketId ?? null,
    })),
  });
  publish({ type: "notification", userIds: targets, payload: { title: input.title, body: input.body, ticketId: input.ticketId, notificationType: input.type } });
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
