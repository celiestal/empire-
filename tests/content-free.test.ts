import { describe, expect, it } from "vitest";
import { chatPrompt, ideaStarters, keywords, nicheWords, subjectOf, templateContent } from "@/lib/content-free";
import { DEFAULT_CONTENT_SETTINGS } from "@/lib/types";

const settings = { id: "u", ...DEFAULT_CONTENT_SETTINGS };

describe("free content writer", () => {
  it("pulls the subject out of a question", () => {
    expect(subjectOf("How do I price my services?")).toBe("price your services");
    expect(subjectOf("Pricing for beginners")).toBe("Pricing for beginners");
    expect(keywords("price your services")).toEqual(["price", "services"]);
  });

  it("builds a full outline with 3 hooks, brand-first hashtags and a question caption", () => {
    const g = templateContent("How do I price my services?", settings);
    expect(g.script.hookOptions).toHaveLength(3);
    expect(new Set(g.script.hookOptions).size).toBe(3);
    expect(g.script.hook).toBe(g.script.hookOptions[0]);
    expect(g.script.valuePoints).toHaveLength(3);
    expect(g.caption.endsWith("?")).toBe(true);
    expect(g.hashtags[0]).toBe("#Empire");
    expect(g.hashtags).toContain("#PriceServices");
    expect(g.hashtags.some((t) => /fyp|foryou|viral/i.test(t))).toBe(false);
  });

  it("uses the question itself as a hook when the topic is a long question", () => {
    const g = templateContent("What's the biggest mistake people make when they start out in small business?", settings);
    expect(g.script.hook).toBe("What's the biggest mistake people make when they start out in small business?");
  });

  it("gives different hooks for a different variant", () => {
    const a = templateContent("Getting clients", settings, 0).script.hookOptions;
    const b = templateContent("Getting clients", settings, 1).script.hookOptions;
    expect(a).not.toEqual(b);
  });

  it("phrases idea starters for the niche and writes a chatbot prompt", () => {
    expect(nicheWords(settings)).toBe("small business");
    expect(ideaStarters(settings)[0]).toContain("small business");
    const p = chatPrompt("Getting clients", settings);
    expect(p).toContain("Getting clients");
    expect(p).toContain("60 seconds");
  });
});
