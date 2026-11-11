import { BANNED_HASHTAGS, buildHashtags } from "@/lib/content";
import { HOOK_PLAYBOOK } from "@/lib/video/techniques";
import type { ContentSettings, VideoScript } from "@/lib/types";

/**
 * Free content tools that run on the site itself, with no paid AI calls:
 * a fill-in script writer, idea starters, and a prompt the user can paste into
 * a free chatbot for a fully written script.
 */

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from get got how i if in into is it its me my of on or should so that the their them there these they this to was we what when where which who why will with without you your yours".split(
    " ",
  ),
);

const QUESTION_LEAD = /^(how (do|can|should) (i|you|we)|how to|what (is|are|should)|why (do|does|is|are)|should (i|you)|can (i|you)|is it|do (i|you))\s+/i;

/** "How do I price my services?" -> "price your services" (spoken to the viewer). */
export function subjectOf(topic: string): string {
  const s = topic.trim().replace(/[?.!]+$/, "").replace(QUESTION_LEAD, "").trim() || topic.trim();
  return s
    .replace(/\bmy\b/gi, "your")
    .replace(/\bmine\b/gi, "yours")
    .replace(/\b(I|me)\b/g, "you")
    .replace(/\bI'm\b/g, "you're");
}

/** Content words from the topic, longest first, for hashtags and emphasis. */
export function keywords(topic: string): string[] {
  const words = topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "#SmallBusinessTips" -> "small business" (used to phrase idea starters). */
export function nicheWords(settings: Pick<ContentSettings, "nicheTags">): string {
  const tag = settings.nicheTags[0]?.replace(/^#/, "") ?? "";
  const words = tag
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !["tips", "tip", "hacks", "advice"].includes(w));
  return words.join(" ") || "your business";
}

const HOOKS: ((topic: string, subject: string) => string)[] = [
  (_t, s) => `Most people get this wrong: ${s}.`,
  (t) => `You keep asking me: ${t.replace(/[.!]*$/, "")}${/\?$/.test(t) ? "" : "?"} Here's the answer.`,
  (_t, s) => `3 things nobody tells you about this: ${s}.`,
  (_t, s) => `Stop scrolling if you're stuck on this: ${s}.`,
  (_t, s) => `I wasted months on this before I figured it out: ${s}.`,
  (_t, s) => `Do this before you ${s.split(" ").length <= 6 ? s : "try anything else"}.`,
];

/** For topics that are still a full question after trimming, the question itself is the hook. */
const QUESTION_HOOKS: ((topic: string) => string)[] = [
  (t) => t,
  (t) => `${t} Most people get this wrong.`,
  (t) => `Everyone asks me this: ${t.charAt(0).toLowerCase()}${t.slice(1)}`,
  (t) => `${t} Here's the honest answer.`,
];

const CLOSES = [
  "Follow for part two, where I go deeper on the first point.",
  "Save this so you have it when you need it.",
  "Comment your biggest question about this and I'll answer it in the next video.",
  "Send this to someone who needs to hear it.",
];

const CAPTIONS: ((topic: string) => string)[] = [
  (t) => `${t} Here's my short answer. Which point surprised you?`,
  (t) => `${t} What I'd tell anyone asking. What would you add?`,
  (t) => `${t} Explained in under a minute. Which one are you trying first?`,
];

export type FreeContent = {
  script: VideoScript;
  onScreenHook: string;
  caption: string;
  hashtags: string[];
};

/**
 * Build a script outline from proven hook and structure templates. The value
 * points are clear prompts for the creator to fill in with their own knowledge,
 * since that is the part only they can write without an AI.
 * `variant` picks a different set of hooks, close and caption each time.
 */
export function templateContent(topic: string, settings: ContentSettings, variant = 0): FreeContent {
  const subject = subjectOf(topic);
  const n = Math.abs(Math.trunc(variant));
  const asQuestion = /^(what|which|who|when|where|why|how|is|are|does|do|can|should)\b/i.test(subject) || subject.split(/\s+/).length > 8;
  const q = /\?$/.test(topic.trim()) ? topic.trim() : `${topic.trim().replace(/[.!]+$/, "")}?`;
  const hookOptions = asQuestion
    ? [0, 1, 2].map((i) => QUESTION_HOOKS[(n + i) % QUESTION_HOOKS.length](q))
    : [0, 1, 2].map((i) => HOOKS[(n + i * 2) % HOOKS.length](topic.trim(), subject));
  const kw = keywords(subject);
  const longest = [...kw].sort((a, b) => b.length - a.length)[0];
  const topicTags = [kw.slice(0, 2).map(cap).join(""), longest ? cap(longest) : ""].filter(Boolean);
  const t = topic.trim();
  const topicSentence = /[?.!]$/.test(t) ? t : `${t}.`;
  return {
    script: {
      hookOptions,
      hook: hookOptions[0],
      setup: `If you're one of the ${settings.audience}, this one matters. Get it right and you save time and money. Here's what to do.`,
      valuePoints: [
        "[First: the most common mistake people make here, and what to do instead]",
        `[Second: one specific step, number or example from your own experience]`,
        `[Third: the quick win someone can try today]`,
      ],
      close: CLOSES[n % CLOSES.length],
    },
    onScreenHook: kw.length ? `${kw.slice(0, 3).map(cap).join(" ")}: the truth` : "Watch this first",
    caption: CAPTIONS[n % CAPTIONS.length](topicSentence),
    hashtags: buildHashtags(topicTags, settings),
  };
}

/** Questions to seed the idea list, phrased for the creator's niche and audience. */
export function ideaStarters(settings: Pick<ContentSettings, "nicheTags" | "audience">): string[] {
  const niche = nicheWords(settings);
  return [
    `What's the biggest mistake people make when they start out in ${niche}?`,
    `How much does it really cost to get started in ${niche}?`,
    `What would I do differently if I started in ${niche} from zero today?`,
    `What are 3 free tools every one of the ${settings.audience} should use?`,
    `How do I get my first paying customer?`,
    `What's a myth in ${niche} that wastes people's time?`,
    `How long does it actually take to see results in ${niche}?`,
  ];
}

/**
 * A ready-to-paste prompt for a free chatbot (the free tiers of Claude or
 * ChatGPT) that returns a fully written script in the same structure.
 */
export function chatPrompt(topic: string, settings: ContentSettings): string {
  return `Write a script for a short vertical video (Instagram Reel / TikTok / YouTube Short).

Topic: ${topic.trim()}
Audience: ${settings.audience}
Length when read aloud: about ${settings.targetSeconds} seconds, never more than ${settings.maxSeconds}.

Structure:
1. Hook (0 to 3 seconds). Give me 3 options, each under 12 words.
2. On-screen text for the hook, 2 to 6 words.
3. Setup (3 to 15 seconds): why this matters to the viewer.
4. Three short value points, one idea each.
5. Close: one call to action.
6. A one-line caption that ends with a question.
7. 2 or 3 hashtags about this exact topic.

Rules for the hook:
${HOOK_PLAYBOOK.map((h) => `- ${h}`).join("\n")}

Write it the way I'd talk: short sentences, no emojis. Never use generic hashtags like ${BANNED_HASHTAGS.slice(0, 5)
    .map((t) => `#${t}`)
    .join(", ")}.`;
}
