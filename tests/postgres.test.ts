import { describe, expect, it } from "vitest";
import { Store, newId, now } from "@/lib/store";
import { PostgresStore } from "@/lib/store/postgres";

// Runs only when a test database is available: PG_TEST_URL=postgres://... npm test
const url = process.env.PG_TEST_URL;

describe.skipIf(!url)("postgres store", () => {
  it("creates its table and round-trips records and settings", async () => {
    const s = new Store(new PostgresStore(url!));
    const email = `${newId("t")}@example.com`;
    await s.insert("users", { id: newId("usr"), email, passwordHash: "x", plan: "free", stripeCustomerId: null, createdAt: now() });
    const u = await s.userByEmail(email);
    expect(u).not.toBeNull();
    await s.update("users", u!.id, { plan: "premium" });
    expect((await s.get("users", u!.id))?.plan).toBe("premium");
    await s.updateSettings({ monthlyBudgetCents: 1234 });
    expect((await s.settings()).monthlyBudgetCents).toBe(1234);
  });
});
