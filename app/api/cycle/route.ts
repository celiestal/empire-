import { timingSafeEqual } from "node:crypto";
import { aiEnabled } from "@/lib/ai";
import { runCeoCycle } from "@/lib/agents/runtime";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Runs one CEO Agent cycle. Called by the scheduler (vercel.json cron) with
 * `Authorization: Bearer $CRON_SECRET`. Does nothing unless AGENTS_AUTORUN=on, so
 * deploying the site never starts the agents by itself.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  if (process.env.AGENTS_AUTORUN !== "on") return Response.json({ skipped: "AGENTS_AUTORUN is not on" });
  if (!aiEnabled()) return Response.json({ skipped: "ANTHROPIC_API_KEY is not set" });
  const result = await runCeoCycle(getStore(), "scheduled cycle");
  return Response.json(result);
}
