import type { ContentIdea, ContentSettings } from "@/lib/types";

/**
 * Content Studio rules, kept in code so every post follows them no matter who
 * (or which agent) made it:
 *
 * - 3 to 5 hashtags per video, all about what the video covers.
 * - Always the brand tag, plus the same niche tags week to week.
 * - Never generic reach tags like #fyp, #foryou, #viral or #explore.
 */

export const BANNED_HASHTAGS = [
  "fyp",
  "fy",
  "foryou",
  "foryoupage",
  "fypage",
  "fypシ",
  "viral",
  "viralvideo",
  "explore",
  "explorepage",
  "trending",
  "reels",
  "reelsinstagram",
  "instagood",
  "tiktok",
  "follow",
  "followme",
  "like",
  "likeforlike",
  "xyzbca",
];

export const MIN_HASHTAGS = 3;
export const MAX_HASHTAGS = 5;

export function normalizeTag(tag: string): string {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
  return cleaned ? `#${cleaned}` : "";
}

export function isBannedTag(tag: string): boolean {
  return BANNED_HASHTAGS.includes(normalizeTag(tag).slice(1).toLowerCase());
}

/**
 * Build the final hashtag set: brand tag first, then niche tags, then topic tags,
 * with banned and duplicate tags removed, capped at MAX_HASHTAGS.
 */
export function buildHashtags(topicTags: string[], settings: Pick<ContentSettings, "brandTag" | "nicheTags">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || isBannedTag(tag)) return;
    const key = tag.toLowerCase();
    if (seen.has(key) || out.length >= MAX_HASHTAGS) return;
    seen.add(key);
    out.push(tag);
  };
  add(settings.brandTag);
  for (const t of settings.nicheTags.slice(0, 2)) add(t);
  for (const t of topicTags) add(t);
  return out;
}

export function hashtagProblems(tags: string[]): string[] {
  const problems: string[] = [];
  if (tags.length < MIN_HASHTAGS) problems.push(`Use at least ${MIN_HASHTAGS} hashtags (has ${tags.length}).`);
  if (tags.length > MAX_HASHTAGS) problems.push(`Use at most ${MAX_HASHTAGS} hashtags (has ${tags.length}).`);
  const banned = tags.filter(isBannedTag);
  if (banned.length) problems.push(`Remove generic tags: ${banned.join(", ")}.`);
  return problems;
}

/** Content gap ideas in pick order: most-asked open questions first, oldest first on ties. */
export function rankIdeas(ideas: ContentIdea[]): ContentIdea[] {
  return ideas
    .filter((i) => i.status === "open")
    .sort((a, b) => b.asks - a.asks || a.createdAt.localeCompare(b.createdAt));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayName(day: number): string {
  return DAY_NAMES[((day % 7) + 7) % 7];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The posting dates for the week that starts on the next planning day on or after `from`.
 * Planning happens first, then filming, then posts go out on the posting days that follow.
 */
export function upcomingWeek(settings: Pick<ContentSettings, "planningDay" | "filmingDay" | "postingDays">, from: Date = new Date()) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const offset = (settings.planningDay - start.getUTCDay() + 7) % 7;
  const planning = new Date(start);
  planning.setUTCDate(start.getUTCDate() + offset);

  const dayAfter = (base: Date, weekday: number) => {
    const d = new Date(base);
    const delta = (weekday - base.getUTCDay() + 7) % 7;
    d.setUTCDate(base.getUTCDate() + delta);
    return d;
  };

  const filming = dayAfter(planning, settings.filmingDay);
  const postDates = [...settings.postingDays]
    .map((day) => dayAfter(filming, day))
    .sort((a, b) => a.getTime() - b.getTime())
    .map(isoDate);

  return { planning: isoDate(planning), filming: isoDate(filming), posts: postDates };
}
