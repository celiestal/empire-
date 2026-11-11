import type { SocialPlatform } from "@/lib/types";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import type { SocialProvider } from "./types";
import { youtube } from "./youtube";

export const PROVIDERS: Partial<Record<SocialPlatform, SocialProvider>> = { instagram, facebook, youtube };

export function provider(platform: string): SocialProvider | null {
  return PROVIDERS[platform as SocialPlatform] ?? null;
}

export function providerReady(p: SocialProvider): boolean {
  return p.env.every((k) => !!process.env[k]);
}

/** Why a platform can't auto-post yet, in plain words. */
export const NOT_SUPPORTED: Partial<Record<SocialPlatform, string>> = {
  tiktok: "TikTok only allows private posts until it reviews the app, so post TikToks yourself for now.",
  x: "X keeps changing what its free API allows for video, so X stays manual for now.",
  linkedin: "LinkedIn only allows video posting for approved partner apps.",
};
