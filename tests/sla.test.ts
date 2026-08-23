import "dotenv/config";
import { describe, it, expect } from "vitest";
import { computeSla, normalizePolicy, targetHoursFor, type SlaPolicy } from "@/lib/sla";

const POLICY: SlaPolicy = {
  enabled: true,
  riskHours: 24,
  defaultHours: 72,
  byPriority: {
    "pri-critical": 4,
    "pri-high": 24,
  },
};

describe("computeSla (policy-aware)", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000);
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600000);

  it("open ticket past its explicit due date -> breached with hours overdue", () => {
    const r = computeSla({ dueDate: hoursAgo(30), statusCategory: "IN_PROGRESS" }, POLICY);
    expect(r.status).toBe("breached");
    expect(r.hoursOverdue).toBe(30);
  });

  it("uses resolveDueAt (priority target) when no manual due date", () => {
    const r = computeSla({ dueDate: null, resolveDueAt: hoursAgo(5), statusCategory: "TODO" }, POLICY);
    expect(r.status).toBe("breached");
  });

  it("explicit due date wins over resolveDueAt", () => {
    const r = computeSla(
      { dueDate: hoursFromNow(100), resolveDueAt: hoursAgo(1), statusCategory: "TODO" },
      POLICY
    );
    expect(r.status).toBe("on_track");
  });

  it("ticket due within risk horizon -> at_risk", () => {
    const r = computeSla({ dueDate: hoursFromNow(10), statusCategory: "TODO" }, POLICY);
    expect(r.status).toBe("at_risk");
  });

  it("ticket due far out -> on_track", () => {
    const r = computeSla({ dueDate: hoursFromNow(72), statusCategory: "TODO" }, POLICY);
    expect(r.status).toBe("on_track");
  });

  it("done tickets are met; no dates -> none", () => {
    expect(computeSla({ dueDate: hoursAgo(48), statusCategory: "DONE" }, POLICY).status).toBe("met");
    expect(computeSla({}, POLICY).status).toBe("none");
  });
});

describe("SLA policy helpers", () => {
  it("targetHoursFor prefers the specific priority entry", () => {
    expect(targetHoursFor(POLICY, "pri-critical")).toBe(4);
  });

  it("falls back to defaultHours and returns null when unset", () => {
    expect(targetHoursFor(POLICY, "pri-low")).toBe(72);
    const noDefault = { ...POLICY, defaultHours: null };
    expect(targetHoursFor(noDefault, "pri-low")).toBeNull();
  });

  it("returns null targets entirely when disabled", () => {
    const off = { ...POLICY, enabled: false };
    expect(targetHoursFor(off, "pri-critical")).toBeNull();
  });

  it("normalizePolicy sanitizes garbage input", () => {
    const p = normalizePolicy({ enabled: false, riskHours: -5, defaultHours: 0, byPriority: { x: -2, y: "8" } });
    expect(p.enabled).toBe(false);
    expect(p.riskHours).toBe(24);
    expect(p.defaultHours).toBeNull();
    expect(p.byPriority).toEqual({ y: 8 });
  });
});
