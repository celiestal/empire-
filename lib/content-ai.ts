import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, FALLBACK, MODEL } from "@/lib/ai";
import { BANNED_HASHTAGS, buildHashtags } from "@/lib/content";
import { HOOK_PLAYBOOK } from "@/lib/video/techniques";
import type { ContentSettings, VideoScript } from "@/lib/types";

const ScriptSchema = z.object({
  hookOptions: z.array(z.string()).describe("Three different hooks, each under 12 words"),
  chosenHookIndex: z.number().int().describe("0-based index of the strongest hook"),
  onScreenHook: z.string().describe("2 to 6 word text overlay shown in the first 2 seconds"),
  setup: z.string().describe("Why this matters to the viewer, one or two sentences"),
  valuePoints: z.array(z.string()).describe("Exactly three short points, one idea each"),
  close: z.string().describe("One call to action"),
  caption: z.string().describe("One-line caption ending in a question that invites comments"),
  topicHashtags: z.array(z.string()).describe("2 to 3 hashtags about this video's specific subject"),
  emphasisWords: z.array(z.string()).describe("Up to 6 words from the script to highlight in captions"),
});

export type GeneratedContent = {
  script: VideoScript;
  onScreenHook: string;
  caption: string;
  hashtags: string[];
  emphasisWords: string[];
};

const SYSTEM = `You write scripts for short vertical videos (Instagram Reels, TikTok, YouTube Shorts).

Every script has four beats: hook (0 to 3 seconds), setup (3 to 15 seconds), value (three short points), close (one call to action in the last 10 seconds). Read aloud, the whole script should take the target length given.

What makes hooks work, from analysis of top-performing short-form videos:
${HOOK_PLAYBOOK.map((h) => `- ${h}`).join("\n")}

Write in plain spoken English, the way the creator would actually talk. Short sentences. No emojis in the script.

Hashtags must describe what this specific video covers. Never suggest generic reach tags such as ${BANNED_HASHTAGS.slice(0, 8)
  .map((t) => `#${t}`)
  .join(", ")}.`;

export async function generateContent(topic: string, settings: ContentSettings): Promise<GeneratedContent> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    betas: [...FALLBACK.betas],
    output_config: { effort: "medium", format: betaZodOutputFormat(ScriptSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}
Audience: ${settings.audience}
Target length: ${settings.targetSeconds} seconds, never more than ${settings.maxSeconds}.
Niche: ${settings.nicheTags.join(" ")}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to write a script for this topic. Try rewording it.");
  }
  const out = response.parsed_output;
  if (!out) throw new Error("The AI response could not be read. Please try again.");

  const hookOptions = out.hookOptions.slice(0, 3);
  const hook = hookOptions[Math.min(Math.max(out.chosenHookIndex, 0), hookOptions.length - 1)] ?? "";

  return {
    script: {
      hookOptions,
      hook,
      setup: out.setup,
      valuePoints: out.valuePoints.slice(0, 3),
      close: out.close,
    },
    onScreenHook: out.onScreenHook,
    caption: out.caption,
    hashtags: buildHashtags(out.topicHashtags, settings),
    emphasisWords: out.emphasisWords.slice(0, 6),
  };
}

/** The script as one block of text, in reading order. */
export function scriptText(s: VideoScript): string {
  return [s.hook, s.setup, ...s.valuePoints, s.close].filter(Boolean).join(" ");
}
