import type { SocialPlatform } from "@/lib/types";

export interface ConnectedAccount {
  externalId: string;
  handle: string;
  token: string;
  expiresAt: string | null;
}

export interface PublishInput {
  videoUrl: string;
  /** Caption with hashtags. */
  caption: string;
  /** Short title (YouTube). */
  title: string;
}

export interface SocialProvider {
  platform: SocialPlatform;
  /** Env vars this provider needs. */
  env: string[];
  /** Where the owner creates the free developer app. */
  setupUrl: string;
  authUrl(state: string, redirectUri: string): string;
  connect(code: string, redirectUri: string): Promise<ConnectedAccount[]>;
  publish(account: { externalId: string; token: string; expiresAt: string | null }, input: PublishInput): Promise<{ externalId: string; refreshed?: { token: string; expiresAt: string | null } }>;
}

export async function json<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } | string; error_description?: string })?.error;
    const detail = typeof msg === "string" ? msg : msg?.message ?? (body as { error_description?: string })?.error_description ?? text.slice(0, 200);
    throw new Error(`${what} failed (${res.status}): ${detail}`);
  }
  return body as T;
}

export const sameHandle = (a: string, b: string) =>
  a.replace(/^@/, "").replace(/\s+/g, "").toLowerCase() === b.replace(/^@/, "").replace(/\s+/g, "").toLowerCase();

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
