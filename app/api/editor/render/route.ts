import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { del, put } from "@vercel/blob";
import { hasFeature } from "@/lib/auth";
import { editorAvailable } from "@/lib/env";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { autoEdit } from "@/lib/video/render";

export const runtime = "nodejs";
export const maxDuration = 300;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Only files in this site's own Blob store are fetched. */
function isOurBlob(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

async function download(url: string, to: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't read the uploaded file (${res.status})`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(to));
}

/**
 * Edits a raw take that the browser already uploaded to Blob storage, saves the
 * finished 1080x1920 video back to storage, and (optionally) attaches it to a post.
 */
export async function POST(req: Request) {
  if (!editorAvailable()) return fail(503, "The auto editor is coming soon.");
  const user = await currentUser();
  if (!user) return fail(401, "Log in first.");
  if (!hasFeature(user, "auto_edit")) return fail(402, "The auto editor is part of Premium.");

  const body = (await req.json().catch(() => null)) as {
    videoUrl?: string;
    musicUrl?: string;
    hook?: string;
    script?: string;
    emphasis?: string;
    sfx?: boolean;
    progress?: boolean;
    postId?: string;
  } | null;
  if (!body?.videoUrl || !isOurBlob(body.videoUrl)) return fail(400, "Upload a video first.");
  if (body.musicUrl && !isOurBlob(body.musicUrl)) return fail(400, "Upload the music again.");

  const store = getStore();
  const post = body.postId ? await store.get("contentPosts", body.postId) : null;
  if (body.postId && (!post || post.userId !== user.id)) return fail(404, "Post not found.");

  const work = await mkdtemp(path.join(tmpdir(), "empire-edit-"));
  try {
    const source = path.join(work, "in.mp4");
    await download(body.videoUrl, source);
    let music: string | undefined;
    if (body.musicUrl) {
      music = path.join(work, "music.audio");
      await download(body.musicUrl, music);
    }
    const output = path.join(work, "out.mp4");
    const plan = await autoEdit({
      source,
      output,
      hookText: body.hook?.trim() || undefined,
      scriptText: body.script?.trim() || undefined,
      emphasisWords: (body.emphasis ?? "")
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
      music,
      options: { sfx: body.sfx !== false, progressBar: body.progress !== false },
    });
    const saved = await put(`edits/${post?.id ?? user.id}.mp4`, await readFile(output), {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });
    // The raw files aren't needed any more; free the storage.
    await del([body.videoUrl, ...(body.musicUrl ? [body.musicUrl] : [])]).catch(() => undefined);
    if (post) await store.update("contentPosts", post.id, { videoUrl: saved.url, status: post.status === "posted" ? "posted" : "filmed" });
    await store.audit(user.email, "auto_edit", `${plan.sourceDuration.toFixed(1)}s -> ${plan.duration.toFixed(1)}s`);

    return Response.json({
      url: saved.url,
      summary: `Done: ${plan.sourceDuration.toFixed(1)}s in, ${plan.duration.toFixed(1)}s out. Cut ${plan.removedSeconds.toFixed(1)}s of pauses, ${plan.segments.length} shots, ${plan.captions.length} captions.${post ? " Attached to your post." : ""}`,
    });
  } catch (err) {
    console.error("auto edit failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (/whole video was silence/.test(msg)) return fail(422, "The whole video was silent, so nothing was left after cutting pauses.");
    return fail(500, "The edit failed. Try a shorter clip (under 2 minutes) or a different file.");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
