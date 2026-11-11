import { provider, providerReady } from "@/lib/social";
import { sameHandle } from "@/lib/social/types";
import type { Store } from "@/lib/store";
import { now } from "@/lib/store";
import { openToken, sealToken } from "@/lib/token-box";
import type { ContentPost, PostResult } from "@/lib/types";

export function fullCaption(post: Pick<ContentPost, "caption" | "hashtags">): string {
  return `${post.caption}\n\n${post.hashtags.join(" ")}`.trim();
}

/**
 * Post one video to every connected account in post.platforms. Each platform is
 * tried separately so one failure doesn't stop the others. Platforms that
 * already succeeded are skipped on a retry.
 */
export async function publishPost(store: Store, post: ContentPost): Promise<PostResult[]> {
  if (!post.videoUrl) throw new Error("Add the finished video first.");
  const accounts = await store.listFor("socialAccounts", post.userId);
  const previous = post.postResults ?? [];
  const results: PostResult[] = [];
  for (const platform of post.platforms) {
    if (previous.some((r) => r.platform === platform && r.ok)) {
      results.push(previous.find((r) => r.platform === platform && r.ok)!);
      continue;
    }
    const p = provider(platform);
    const acct = accounts.find((a) => a.platform === platform && a.status === "connected" && a.tokenEnc && a.externalId);
    if (!p || !providerReady(p) || !acct) {
      results.push({ platform, ok: false, error: "Not connected", at: now() });
      continue;
    }
    try {
      const out = await p.publish(
        { externalId: acct.externalId!, token: openToken(acct.tokenEnc!), expiresAt: acct.tokenExpiresAt ?? null },
        { videoUrl: post.videoUrl, caption: fullCaption(post), title: post.script?.hook || post.topic },
      );
      if (out.refreshed) {
        await store.update("socialAccounts", acct.id, { tokenEnc: sealToken(out.refreshed.token), tokenExpiresAt: out.refreshed.expiresAt });
      }
      results.push({ platform, ok: true, externalId: out.externalId, at: now() });
      await store.update("socialAccounts", acct.id, { lastError: null });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ platform, ok: false, error, at: now() });
      await store.update("socialAccounts", acct.id, { lastError: error });
    }
  }
  const anyOk = results.some((r) => r.ok);
  await store.update("contentPosts", post.id, { postResults: results, status: anyOk ? "posted" : post.status });
  return results;
}

/** Pick the account the user asked for from what the platform returned. */
export function chooseAccount<T extends { handle: string }>(found: T[], wanted: string): T | { error: string } {
  if (!found.length) return { error: "That login has no account Empire can post to." };
  if (!wanted) return found.length === 1 ? found[0] : { error: `Several accounts found (${found.map((f) => `@${f.handle}`).join(", ")}). Type the one you want in the handle box first.` };
  return found.find((f) => sameHandle(f.handle, wanted)) ?? { error: `You logged in as ${found.map((f) => `@${f.handle}`).join(", ")}, not @${wanted.replace(/^@/, "")}. Log in to @${wanted.replace(/^@/, "")} and try again.` };
}
