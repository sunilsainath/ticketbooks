import { EventEmitter } from "events";

/**
 * In-process pub/sub used to push Server-Sent Events to connected clients.
 * For multi-node deployments swap the emitter for Redis pub/sub.
 */
export type RealtimeEvent = {
  type: "notification" | "ticket" | "presence";
  userIds: string[];
  payload?: unknown;
};

const g = globalThis as unknown as { __strikeBus?: EventEmitter };

export function bus(): EventEmitter {
  if (!g.__strikeBus) {
    const em = new EventEmitter();
    em.setMaxListeners(0);
    g.__strikeBus = em;
  }
  return g.__strikeBus;
}

export function publish(evt: RealtimeEvent) {
  bus().emit("event", evt);
}

export function subscribe(handler: (evt: RealtimeEvent) => void) {
  const em = bus();
  em.on("event", handler);
  return () => em.off("event", handler);
}
