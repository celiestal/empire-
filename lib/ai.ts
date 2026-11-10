import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

/**
 * Server-side fallback: if a request is declined by a safety classifier, the API
 * re-runs it on a fallback model chosen by refusal category.
 */
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
} as const;

let client: Anthropic | null = null;

export function aiEnabled(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}
