import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, hasFeature, hashPassword, isOwner, readSessionToken, verifyPassword } from "@/lib/auth";
import { scoreOpportunity } from "@/lib/scoring";

afterEach(() => {
  delete process.env.OWNER_EMAIL;
});

describe("auth", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("signs sessions and rejects tampering and expiry", () => {
    const t = createSessionToken("usr_1", 1000);
    expect(readSessionToken(t, 2000)).toBe("usr_1");
    expect(readSessionToken(t.replace("usr_1", "usr_2"), 2000)).toBeNull();
    expect(readSessionToken(t, 1000 + 31 * 86_400_000)).toBeNull();
  });

  it("gives the owner every premium feature free", () => {
    process.env.OWNER_EMAIL = "Boss@Example.com";
    expect(isOwner({ email: "boss@example.com" })).toBe(true);
    expect(hasFeature({ email: "boss@example.com", plan: "free" }, "auto_edit")).toBe(true);
    expect(hasFeature({ email: "someone@example.com", plan: "free" }, "auto_edit")).toBe(false);
    expect(hasFeature({ email: "someone@example.com", plan: "premium" }, "ai_content")).toBe(true);
  });
});

describe("opportunity scoring", () => {
  it("is first-year return divided by risk", () => {
    expect(scoreOpportunity({ startupCostCents: 100_000, monthlyRevenueEstimateCents: 50_000, risk: 2 })).toBe(2500);
  });
});
