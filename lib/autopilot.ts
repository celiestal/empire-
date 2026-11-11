import { hasFeature } from "@/lib/auth";
import { ideasFromNews, writeVariants } from "@/lib/agents/free-writers";
import { freeAiEnabled } from "@/lib/free-ai";
import { scoutNews } from "@/lib/news";
import { planWeekFor } from "@/lib/planner";
import { publishPost } from "@/lib/poster";
import type { Store } from "@/lib/store";
import { newId, now } from "@/lib/store";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The daily autopilot. Free: news comes from RSS, writing uses Gemini's free tier
 * when a key is set and templates otherwise, and posting uses each platform's
 * free API.
 *
 * 1. News scouts read AI news and starting-a-business news.
 * 2. The idea agent turns the best fresh headlines into viewer questions.
 * 3. The planner fills the coming week's posting days from the top ideas.
 * 4. Writer sub-agents script every planned post from three angles; the editor picks one.
 * 5. The poster publishes today's posts that have a video and auto-post on.
 */
export async function runAutopilot(store: Store, opts: { userId?: string; deadlineMs?: number } = {}): Promise<string[]> {
  const started = Date.now();
  const deadline = started + (opts.deadlineMs ?? 270_000);
  const log: string[] = [];
  const say = (s: string) => log.push(s);

  const aiNew = await scoutNews(store, "ai");
  const bizNew = await scoutNews(store, "business");
  say(`News scouts: ${aiNew} new AI stories, ${bizNew} new business stories.`);

  const users = (await store.list("users")).filter((u) => (opts.userId ? u.id === opts.userId : true) && hasFeature(u, "ai_content"));
  for (const user of users) {
    const settings = await store.contentSettings(user.id);
    if (!opts.userId && !settings.autopilot) continue;
    const who = user.email.split("@")[0];

    // Ideas from news, at most 2 per kind per day so the list stays focused.
    const fresh = (await store.list("news")).filter((n) => !n.used);
    const pick = [...fresh.filter((n) => n.kind === "ai").slice(0, 8), ...fresh.filter((n) => n.kind === "business").slice(0, 8)];
    const known = new Set((await store.listFor("contentIdeas", user.id)).map((i) => i.question.toLowerCase()));
    const ideas = await ideasFromNews(pick, settings, 4);
    let added = 0;
    for (const idea of ideas) {
      if (known.has(idea.question.toLowerCase())) continue;
      await store.insert("contentIdeas", { id: newId("idea"), userId: user.id, question: idea.question, source: "news", asks: 1, status: "open", createdAt: now() });
      added++;
    }
    for (const n of pick) await store.update("news", n.id, { used: true });
    say(`${who}: idea agent added ${added} ideas from the news.`);

    const planned = await planWeekFor(store, user.id, { autoPost: true });
    say(`${who}: planner added ${planned} posts to the coming week.`);

    const toWrite = (await store.listFor("contentPosts", user.id)).filter((p) => !p.script && p.status === "idea").slice(0, 3);
    for (const post of toWrite) {
      if (Date.now() > deadline - 60_000) break;
      const w = await writeVariants(post.topic, settings);
      const best = w.variants[w.best];
      await store.update("contentPosts", post.id, {
        script: best.script,
        caption: best.caption,
        hashtags: best.hashtags,
        scriptVariants: w.variants,
        status: "scripted",
      });
      say(`${who}: writers scripted "${post.topic}" (${w.usedAi ? `free AI, picked the ${best.angle} version` : "templates"})${w.error ? `. AI error: ${w.error}` : ""}.`);
    }

    const due = (await store.listFor("contentPosts", user.id)).filter(
      (p) => p.autoPost && p.videoUrl && p.status !== "posted" && p.scheduledFor && p.scheduledFor <= today(),
    );
    for (const post of due) {
      if (Date.now() > deadline - 90_000) {
        say(`${who}: out of time, "${post.topic}" will post on the next run.`);
        break;
      }
      const results = await publishPost(store, post);
      say(`${who}: posted "${post.topic}": ${results.map((r) => `${r.platform} ${r.ok ? "done" : `failed (${r.error})`}`).join(", ") || "no platforms picked"}.`);
    }
    const waiting = (await store.listFor("contentPosts", user.id)).filter((p) => p.status !== "posted" && !p.videoUrl && p.scheduledFor && p.scheduledFor <= today());
    if (waiting.length) say(`${who}: ${waiting.length} post(s) due today still need a video.`);
  }
  if (!freeAiEnabled()) say("Free AI is off (no GEMINI_API_KEY), so scripts used templates.");
  await store.insert("autopilotRuns", { id: newId("run"), lines: log, createdAt: now() });
  return log;
}
