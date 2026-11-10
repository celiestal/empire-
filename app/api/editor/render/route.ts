import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasFeature } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { autoEdit } from "@/lib/video/render";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return fail(401, "Log in first.");
  if (!hasFeature(user, "auto_edit")) return fail(402, "The auto editor is part of Premium.");

  const form = await req.formData();
  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) return fail(400, "Choose a video file.");
  if (video.size > MAX_UPLOAD_BYTES) return fail(413, "That file is over 500 MB.");
  const music = form.get("music");
  const text = (k: string) => String(form.get(k) ?? "").trim();

  const work = await mkdtemp(path.join(tmpdir(), "empire-upload-"));
  try {
    const source = path.join(work, `in${path.extname(video.name) || ".mp4"}`);
    await writeFile(source, Buffer.from(await video.arrayBuffer()));
    let musicPath: string | undefined;
    if (music instanceof File && music.size > 0) {
      musicPath = path.join(work, `music${path.extname(music.name) || ".mp3"}`);
      await writeFile(musicPath, Buffer.from(await music.arrayBuffer()));
    }
    const output = path.join(work, "out.mp4");

    const plan = await autoEdit({
      source,
      output,
      hookText: text("hook") || undefined,
      scriptText: text("script") || undefined,
      emphasisWords: text("emphasis")
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
      music: musicPath,
      options: { sfx: form.get("sfx") === "on", progressBar: form.get("progress") === "on" },
    });
    await getStore().audit(user.email, "auto_edit", `${plan.sourceDuration.toFixed(1)}s -> ${plan.duration.toFixed(1)}s`);

    const summary = `Done: ${plan.sourceDuration.toFixed(1)}s in, ${plan.duration.toFixed(1)}s out. Cut ${plan.removedSeconds.toFixed(1)}s of pauses, ${plan.segments.length} shots, ${plan.captions.length} captions.`;
    return new Response(new Uint8Array(await readFile(output)), {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": 'attachment; filename="empire-edit.mp4"',
        "x-edit-summary": summary,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|spawn ffmpeg|spawn ffprobe/.test(msg)) {
      return fail(503, "Video editing isn't available on this server yet (ffmpeg is not installed here).");
    }
    console.error("auto edit failed", err);
    return fail(500, "The edit failed. Try a different file, or a shorter clip.");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
