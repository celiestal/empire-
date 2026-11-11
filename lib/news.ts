import { createHash } from "node:crypto";
import type { Store } from "@/lib/store";
import { now } from "@/lib/store";
import type { NewsItem } from "@/lib/types";

/** Free RSS feeds the two news scouts read. No keys or accounts needed. */
export const FEEDS: Record<NewsItem["kind"], string[]> = {
  ai: [
    "https://news.google.com/rss/search?q=%22artificial+intelligence%22+OR+%22AI+tool%22+OR+ChatGPT+OR+Claude+OR+Gemini+when:2d&hl=en-US&gl=US&ceid=US:en",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
  ],
  business: [
    "https://news.google.com/rss/search?q=%22start+a+business%22+OR+%22small+business%22+OR+%22side+hustle%22+OR+entrepreneur+when:3d&hl=en-US&gl=US&ceid=US:en",
    "https://www.entrepreneur.com/latest.rss",
  ],
};

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

/** Parse RSS 2.0 items. Google News titles end in " - Source", which is split off. */
export function parseRss(xml: string): { title: string; link: string; source: string; publishedAt: string | null }[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((block) => {
      let title = tag(block, "title");
      let source = tag(block, "source");
      const dash = title.lastIndexOf(" - ");
      if (!source && dash > 0) source = title.slice(dash + 3);
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const date = tag(block, "pubDate");
      const parsed = date ? new Date(date) : null;
      return {
        title,
        link: tag(block, "link"),
        source,
        publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      };
    })
    .filter((i) => i.title && i.link);
}

const newsId = (link: string) => `news_${createHash("sha1").update(link).digest("hex").slice(0, 16)}`;

/** One scout: read its feeds and save headlines it hasn't seen. Returns how many were new. */
export async function scoutNews(store: Store, kind: NewsItem["kind"], perFeed = 8): Promise<number> {
  let added = 0;
  for (const url of FEEDS[kind]) {
    let xml: string;
    try {
      const res = await fetch(url, { headers: { "user-agent": "EmpireNewsScout/1.0" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }
    for (const item of parseRss(xml).slice(0, perFeed)) {
      const id = newsId(item.link);
      if (await store.get("news", id)) continue;
      await store.insert("news", { id, kind, ...item, used: false, createdAt: now() });
      added++;
    }
  }
  return added;
}
