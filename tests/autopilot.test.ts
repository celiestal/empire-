import { afterEach, describe, expect, it, vi } from "vitest";
import { runAutopilot } from "@/lib/autopilot";
import { parseRss } from "@/lib/news";
import { chooseAccount, publishPost } from "@/lib/poster";
import { Store, newId, now } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";
import { openToken, sealToken } from "@/lib/token-box";

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>OpenAI ships a new agent tool - The Verge</title><link>https://example.com/a</link><pubDate>Tue, 10 Nov 2026 12:00:00 GMT</pubDate><source url="https://theverge.com">The Verge</source></item>
<item><title><![CDATA[How to start a business for &lt;$100]]></title><link>https://example.com/b</link></item>
</channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("news scouts", () => {
  it("parses RSS and strips the Google News source suffix", () => {
    const items = parseRss(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "OpenAI ships a new agent tool", source: "The Verge", link: "https://example.com/a" });
    expect(items[1].title).toBe("How to start a business for <$100");
  });
});

describe("account choice", () => {
  const found = [{ handle: "anthro_agent" }, { handle: "other" }];
  it("only accepts the handle the owner typed", () => {
    expect(chooseAccount(found, "@Anthro_Agent")).toEqual({ handle: "anthro_agent" });
    expect(chooseAccount([{ handle: "other" }], "anthro_agent")).toHaveProperty("error");
    expect(chooseAccount(found, "")).toHaveProperty("error");
  });
});

describe("token box", () => {
  it("round-trips and hides the token", () => {
    const sealed = sealToken("secret-token");
    expect(sealed).not.toContain("secret-token");
    expect(openToken(sealed)).toBe("secret-token");
  });
});

describe("autopilot", () => {
  it("scouts news, adds ideas, plans and scripts the week, with no paid AI", async () => {
    vi.stubEnv("OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(RSS, { status: 200 })));
    const store = new Store(new MemoryStore());
    const user = await store.insert("users", { id: "usr_1", email: "owner@example.com", passwordHash: "x", plan: "free", stripeCustomerId: null, createdAt: now() });
    await store.updateContentSettings(user.id, { autopilot: true });
    const log = await runAutopilot(store);
    expect(log[0]).toContain("2 new AI stories");
    const ideas = await store.listFor("contentIdeas", user.id);
    expect(ideas.length).toBeGreaterThan(0);
    const posts = await store.listFor("contentPosts", user.id);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.autoPost)).toBe(true);
    const scripted = posts.filter((p) => p.script);
    expect(scripted.length).toBeGreaterThan(0);
    expect(scripted[0].scriptVariants).toHaveLength(3);
    // A second run doesn't duplicate news or ideas.
    await runAutopilot(store);
    expect((await store.list("news")).length).toBe(2);
  });

  it("skips users who haven't turned it on", async () => {
    vi.stubEnv("OWNER_EMAIL", "owner@example.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const store = new Store(new MemoryStore());
    await store.insert("users", { id: "usr_1", email: "owner@example.com", passwordHash: "x", plan: "free", stripeCustomerId: null, createdAt: now() });
    await runAutopilot(store);
    expect(await store.list("contentPosts")).toHaveLength(0);
  });
});

describe("poster", () => {
  it("posts to connected platforms and reports the rest", async () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "id");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "secret");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("/media_publish")) return Response.json({ id: "ig_post_1" });
        if (String(url).includes("/media")) return Response.json({ id: "container_1" });
        return Response.json({ status_code: "FINISHED" });
      }),
    );
    const store = new Store(new MemoryStore());
    await store.insert("socialAccounts", {
      id: newId("soc"), userId: "u", platform: "instagram", handle: "anthro_agent", status: "connected", connectedAt: now(),
      externalId: "ig_1", tokenEnc: sealToken("tok"), tokenExpiresAt: new Date(Date.now() + 50 * 86_400_000).toISOString(),
    });
    const post = await store.insert("contentPosts", {
      id: newId("post"), userId: "u", ideaId: null, topic: "t", script: null, caption: "Hi?", hashtags: ["#Empire"],
      platforms: ["instagram", "facebook"], scheduledFor: null, status: "filmed", approvalId: null, createdAt: now(),
      videoUrl: "https://blob.example.com/v.mp4",
    });
    const results = await publishPost(store, post);
    expect(results.find((r) => r.platform === "instagram")).toMatchObject({ ok: true, externalId: "ig_post_1" });
    expect(results.find((r) => r.platform === "facebook")).toMatchObject({ ok: false, error: "Not connected" });
    expect(calls[0]).toContain("graph.instagram.com/v23.0/ig_1/media");
    expect((await store.get("contentPosts", post.id))?.status).toBe("posted");
  });
});
