import { buildHashtags, upcomingWeek } from "@/lib/content";
import type { Store } from "@/lib/store";
import { newId, now } from "@/lib/store";

/** Turn the most-asked open ideas into posts on the coming week's posting days that don't have one yet. */
export async function planWeekFor(store: Store, userId: string, opts: { autoPost?: boolean } = {}): Promise<number> {
  const settings = await store.contentSettings(userId);
  const week = upcomingWeek(settings);
  const posts = await store.listFor("contentPosts", userId);
  const taken = new Set(posts.map((p) => p.scheduledFor));
  const freeDays = week.posts.filter((d) => !taken.has(d));
  const ideas = (await store.listFor("contentIdeas", userId))
    .filter((i) => i.status === "open")
    .sort((a, b) => b.asks - a.asks || a.createdAt.localeCompare(b.createdAt))
    .slice(0, freeDays.length);
  for (const [i, idea] of ideas.entries()) {
    await store.insert("contentPosts", {
      id: newId("post"),
      userId,
      ideaId: idea.id,
      topic: idea.question,
      script: null,
      caption: "",
      hashtags: buildHashtags([], settings),
      platforms: ["instagram", "facebook", "youtube"],
      scheduledFor: freeDays[i],
      status: "idea",
      approvalId: null,
      createdAt: now(),
      autoPost: opts.autoPost ?? false,
    });
    await store.update("contentIdeas", idea.id, { status: "planned" });
  }
  return ideas.length;
}
