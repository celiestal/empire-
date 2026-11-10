import { describe, expect, it } from "vitest";
import { buildHashtags, hashtagProblems, rankIdeas, upcomingWeek } from "@/lib/content";
import type { ContentIdea } from "@/lib/types";

describe("hashtags", () => {
  const settings = { brandTag: "#Empire", nicheTags: ["SmallBusinessTips"] };

  it("puts brand and niche first, drops generic tags, caps at 5", () => {
    const tags = buildHashtags(["#fyp", "#ForYouPage", "pricing strategy", "#viral", "#Pricing", "#Freelance", "#Tips", "#More"], settings);
    expect(tags).toEqual(["#Empire", "#SmallBusinessTips", "#pricingstrategy", "#Pricing", "#Freelance"]);
    expect(tags.some((t) => /fyp|foryou|viral/i.test(t))).toBe(false);
  });

  it("dedupes case-insensitively", () => {
    expect(buildHashtags(["#empire", "#EMPIRE", "#Pricing"], settings)).toEqual(["#Empire", "#SmallBusinessTips", "#Pricing"]);
  });

  it("reports problems", () => {
    expect(hashtagProblems(["#a"])).toHaveLength(1);
    expect(hashtagProblems(["#a", "#b", "#fyp"])[0]).toContain("#fyp");
    expect(hashtagProblems(["#a", "#b", "#c"])).toEqual([]);
  });
});

describe("planning", () => {
  it("ranks open ideas by asks, oldest first on ties", () => {
    const idea = (id: string, asks: number, createdAt: string, status: ContentIdea["status"] = "open"): ContentIdea => ({
      id, userId: "u", question: id, source: "x", asks, status, createdAt,
    });
    const ranked = rankIdeas([
      idea("a", 1, "2026-01-01"),
      idea("b", 3, "2026-01-02"),
      idea("c", 3, "2026-01-01"),
      idea("d", 9, "2026-01-01", "used"),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("lays out plan Sunday, film Monday, post Mon/Wed/Fri", () => {
    // 2026-11-10 is a Tuesday.
    const w = upcomingWeek({ planningDay: 0, filmingDay: 1, postingDays: [1, 3, 5] }, new Date("2026-11-10T12:00:00Z"));
    expect(w).toEqual({ planning: "2026-11-15", filming: "2026-11-16", posts: ["2026-11-16", "2026-11-18", "2026-11-20"] });
  });
});
