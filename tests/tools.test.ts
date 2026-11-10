import { describe, expect, it } from "vitest";
import { buildTools } from "@/lib/agents/tools";
import { MemoryStore } from "@/lib/store/memory";
import { Store, newId, now } from "@/lib/store";
import type { Agent } from "@/lib/types";

function setup() {
  const store = new Store(new MemoryStore());
  const agent: Agent = { id: newId("agt"), role: "sales", name: "Sales Agent", mission: "", parentId: null, status: "active", createdAt: now() };
  const tools = buildTools({ store, agent, depth: 1, runAgent: async () => "ok" });
  return { store, tools };
}

describe("agent tools", () => {
  it("files outreach as a pending approval instead of doing it", async () => {
    const { store, tools } = setup();
    const out = await tools.request_approval.run({ kind: "outreach", summary: "Email 5 dentists", detail: "...", amountUsd: 0 });
    expect(out).toContain("waiting for the owner");
    const approvals = await store.list("approvals");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].status).toBe("pending");
  });

  it("refuses spending over budget", async () => {
    const { store, tools } = setup();
    await store.updateSettings({ monthlyBudgetCents: 1000, perActionLimitCents: 1000 });
    const out = await tools.request_approval.run({ kind: "spend", summary: "Ads", detail: "", amountUsd: 50 });
    expect(out).toContain("Refused by policy");
    expect(await store.list("approvals")).toHaveLength(0);
  });

  it("stops all writes when the kill switch is on", async () => {
    const { store, tools } = setup();
    await store.updateSettings({ killSwitch: true });
    expect(await tools.save_knowledge.run({ topic: "t", content: "c" })).toContain("Refused");
    expect(await store.list("knowledge")).toHaveLength(0);
  });

  it("scores recorded opportunities itself", async () => {
    const { store, tools } = setup();
    await tools.record_opportunity.run({ title: "x", summary: "y", market: "z", startupCostUsd: 1000, monthlyRevenueUsd: 500, risk: 2 });
    const [o] = await store.list("opportunities");
    expect(o.score).toBe(2500);
  });

  it("specialists cannot delegate further", async () => {
    const { tools } = setup();
    expect(await tools.delegate.run({ role: "finance", instruction: "x" })).toContain("cannot delegate");
  });
});
