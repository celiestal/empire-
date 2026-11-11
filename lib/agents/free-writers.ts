import { z } from "zod";
import { BANNED_HASHTAGS, buildHashtags } from "@/lib/content";
import { templateContent } from "@/lib/content-free";
import { freeAiEnabled, geminiJson } from "@/lib/free-ai";
import { HOOK_PLAYBOOK } from "@/lib/video/techniques";
import type { ContentSettings, NewsItem, ScriptVariant } from "@/lib/types";

/**
 * Writer sub-agents. Each writes the same topic from a different angle, then an
 * editor agent picks the strongest. Runs on Gemini's free tier when a key is
 * set, and falls back to the free templates when it isn't.
 */
export const WRITER_ANGLES = [
  { id: "teacher", label: "Teacher", brief: "Clear and practical. Teach three concrete steps the viewer can use today." },
  { id: "storyteller", label: "Storyteller", brief: "Open with a short, specific story or moment, then turn it into the lesson." },
  { id: "mythbuster", label: "Myth-buster", brief: "Start by naming a common belief and showing why it's wrong, then give the better way." },
] as const;

const ScriptOut = z.object({
  hookOptions: z.array(z.string()).min(1),
  setup: z.string(),
  valuePoints: z.array(z.string()).min(1),
  close: z.string(),
  caption: z.string(),
  topicHashtags: z.array(z.string()),
});

const SHAPE = `{"hookOptions": [3 hooks, each under 12 words], "setup": "1-2 sentences", "valuePoints": [3 short points], "close": "one call to action", "caption": "one line ending in a question", "topicHashtags": [2-3 hashtags about this exact topic]}`;

const system = (settings: ContentSettings, brief: string) => `You write scripts for short vertical videos (Instagram Reels, TikTok, YouTube Shorts).
Audience: ${settings.audience}. Length read aloud: about ${settings.targetSeconds} seconds, never more than ${settings.maxSeconds}.
Your angle: ${brief}
Hook rules:
${HOOK_PLAYBOOK.map((h) => `- ${h}`).join("\n")}
Plain spoken English, short sentences, no emojis. Be accurate: if you mention a fact, a product or a number, it must be real and current. Never use generic hashtags like ${BANNED_HASHTAGS.slice(0, 5).map((t) => `#${t}`).join(", ")}.`;

function fromTemplates(topic: string, settings: ContentSettings): ScriptVariant[] {
  return WRITER_ANGLES.map((a, i) => {
    const g = templateContent(topic, settings, i);
    return { angle: `${a.label} (template)`, script: g.script, caption: g.caption, hashtags: g.hashtags };
  });
}

/** Run all writer sub-agents on one topic. `context` is extra background, e.g. the news story behind it. */
export async function writeVariants(topic: string, settings: ContentSettings, context = ""): Promise<{ variants: ScriptVariant[]; best: number; usedAi: boolean; error?: string }> {
  if (!freeAiEnabled()) return { variants: fromTemplates(topic, settings), best: 0, usedAi: false };
  const results = await Promise.allSettled(
    WRITER_ANGLES.map(async (a) => {
      const out = await geminiJson({
        system: system(settings, a.brief),
        prompt: `Topic: ${topic}${context ? `\nBackground: ${context}` : ""}`,
        schema: ScriptOut,
        shape: SHAPE,
      });
      const hookOptions = out.hookOptions.slice(0, 3);
      return {
        angle: a.label,
        script: { hookOptions, hook: hookOptions[0], setup: out.setup, valuePoints: out.valuePoints.slice(0, 3), close: out.close },
        caption: out.caption,
        hashtags: buildHashtags(out.topicHashtags, settings),
      } satisfies ScriptVariant;
    }),
  );
  const variants = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!variants.length) {
    const err = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    return { variants: fromTemplates(topic, settings), best: 0, usedAi: false, error: String(err?.reason?.message ?? err?.reason ?? "") };
  }
  return { variants, best: await pickBest(variants, settings), usedAi: true };
}

/** Editor agent: picks the variant most likely to hold attention. */
async function pickBest(variants: ScriptVariant[], settings: ContentSettings): Promise<number> {
  if (variants.length < 2) return 0;
  try {
    const out = await geminiJson({
      system: `You are a short-form video editor. Pick the script most likely to stop ${settings.audience} from scrolling and keep them to the end.`,
      prompt: variants.map((v, i) => `#${i} (${v.angle})\nHook: ${v.script.hook}\nSetup: ${v.script.setup}\nPoints: ${v.script.valuePoints.join(" | ")}\nClose: ${v.script.close}`).join("\n\n"),
      schema: z.object({ best: z.number().int() }),
      shape: `{"best": index number}`,
      temperature: 0.2,
    });
    return Math.min(Math.max(out.best, 0), variants.length - 1);
  } catch {
    return 0;
  }
}

/** Idea agent: turns fresh headlines into questions the audience would ask. */
export async function ideasFromNews(news: NewsItem[], settings: ContentSettings, max = 3): Promise<{ question: string; newsId: string }[]> {
  if (!news.length) return [];
  if (freeAiEnabled()) {
    try {
      const out = await geminiJson({
        system: `You plan short videos for ${settings.audience}. From today's headlines, pick the ones this audience would most want explained and turn each into the question a viewer would ask. Skip gossip, politics and anything you can't explain usefully in 60 seconds.`,
        prompt: news.map((n, i) => `#${i} [${n.kind}] ${n.title} (${n.source})`).join("\n"),
        schema: z.object({ ideas: z.array(z.object({ index: z.number().int(), question: z.string() })) }),
        shape: `{"ideas": [{"index": headline number, "question": "the viewer's question"}] (at most ${max})}`,
        temperature: 0.5,
      });
      return out.ideas
        .filter((i) => news[i.index])
        .slice(0, max)
        .map((i) => ({ question: i.question, newsId: news[i.index].id }));
    } catch {
      // fall through to the template version
    }
  }
  return news.slice(0, max).map((n) => ({ question: `${n.title}: what does this mean for you?`, newsId: n.id }));
}
