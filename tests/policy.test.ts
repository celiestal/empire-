import { describe, expect, it } from "vitest";
import { evaluate, spentThisMonthCents } from "@/lib/policy";
import { DEFAULT_SETTINGS } from "@/lib/types";

const settings = { ...DEFAULT_SETTINGS, monthlyBudgetCents: 10_000, perActionLimitCents: 5_000 };

describe("policy gate", () => {
  it("lets internal work and reads through", () => {
    expect(evaluate({ kind: "internal" }, settings, 0).decision).toBe("allow");
    expect(evaluate({ kind: "read" }, settings, 0).decision).toBe("allow");
  });

  it("always requires approval for outward actions", () => {
    for (const kind of ["spend", "outreach", "deploy", "contract", "publish"] as const) {
      expect(evaluate({ kind, amountCents: kind === "spend" ? 1000 : 0 }, settings, 0).decision).toBe("require_approval");
    }
  });

  it("denies spending over the per-action limit or remaining budget", () => {
    expect(evaluate({ kind: "spend", amountCents: 6_000 }, settings, 0).decision).toBe("deny");
    expect(evaluate({ kind: "spend", amountCents: 4_000 }, settings, 7_000).decision).toBe("deny");
    expect(evaluate({ kind: "spend", amountCents: 1 }, DEFAULT_SETTINGS, 0).decision).toBe("deny");
  });

  it("kill switch blocks everything but reads", () => {
    const off = { ...settings, killSwitch: true };
    expect(evaluate({ kind: "read" }, off, 0).decision).toBe("allow");
    expect(evaluate({ kind: "internal" }, off, 0).decision).toBe("deny");
    expect(evaluate({ kind: "outreach" }, off, 0).decision).toBe("deny");
  });

  it("counts only this month's expenses", () => {
    const at = new Date("2026-11-15T00:00:00Z");
    const ledger = [
      { id: "1", projectId: null, amountCents: -500, description: "", createdAt: "2026-11-02T00:00:00Z" },
      { id: "2", projectId: null, amountCents: -900, description: "", createdAt: "2026-10-30T00:00:00Z" },
      { id: "3", projectId: null, amountCents: 2000, description: "revenue", createdAt: "2026-11-03T00:00:00Z" },
    ];
    expect(spentThisMonthCents(ledger, at)).toBe(500);
  });
});
