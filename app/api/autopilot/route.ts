import { timingSafeEqual } from "node:crypto";
import { aiEnabled } from "@/lib/ai";
import { runCeoCycle } from "@/lib/agents/runtime";
import { runAutopilot } from "@/lib/autopilot";
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

/** Daily run, called by the Vercel cron in vercel.json with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const store = getStore();
  const log = await runAutopilot(store, { deadlineMs: 240_000 });
  // The paid CEO agents only run if they've been switched on and have a key.
  if (process.env.AGENTS_AUTORUN === "on" && aiEnabled()) {
    const r = await runCeoCycle(store, "scheduled cycle");
    log.push(`CEO agents: ${r.refused ?? "ran"}`);
  }
  return Response.json({ log });
}
