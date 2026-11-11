import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildFfmpegArgs, buildFilterGraph } from "./ffmpeg";
import { buildEditPlan, parseSilences, type EditOptions, type EditPlan, type Word } from "./plan";

/**
 * Runs ffmpeg. Uses FFMPEG_PATH if set, otherwise the ffmpeg binary bundled by
 * the ffmpeg-static package (so it works on Vercel), otherwise ffmpeg on PATH.
 */
export function ffmpegBin(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return "ffmpeg";
}

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Reads the duration from ffmpeg's own output, so ffprobe isn't needed. */
export async function probeDuration(file: string): Promise<number> {
  const r = await run(ffmpegBin(), ["-hide_banner", "-i", file]);
  const m = r.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Couldn't read the video's length: ${r.stderr.slice(-300)}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Finds pauses: stretches quieter than -35 dB for at least `minPause` seconds. */
export async function detectSilences(file: string, duration: number, minPause: number) {
  const r = await run(ffmpegBin(), [
    "-hide_banner",
    "-i",
    file,
    "-af",
    `silencedetect=noise=-35dB:d=${minPause}`,
    "-f",
    "null",
    "-",
  ]);
  if (r.code !== 0) throw new Error(`silence detection failed: ${r.stderr.slice(-500)}`);
  return parseSilences(r.stderr, duration);
}

const FONT_CANDIDATES = [
  process.env.EDITOR_FONT_FILE,
  path.join(process.cwd(), "lib/video/fonts/DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/Library/Fonts/Arial Bold.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
];

export function findFont(): string {
  const found = FONT_CANDIDATES.find((f) => f && existsSync(f));
  if (!found) throw new Error("No bold font found. Set EDITOR_FONT_FILE to a .ttf or .otf file.");
  return found;
}

export async function autoEdit(opts: {
  source: string;
  output: string;
  hookText?: string;
  scriptText?: string;
  words?: Word[];
  emphasisWords?: string[];
  music?: string;
  options?: Partial<EditOptions>;
}): Promise<EditPlan> {
  const duration = await probeDuration(opts.source);
  const minPause = opts.options?.minPause ?? 0.35;
  const silences = await detectSilences(opts.source, duration, minPause);
  const plan = buildEditPlan({ duration, silences, ...opts });

  const work = await mkdtemp(path.join(tmpdir(), "empire-edit-"));
  const texts: Promise<void>[] = [];
  const textFile = (key: string, text: string) => {
    const p = path.join(work, `${key}.txt`);
    texts.push(writeFile(p, text));
    return p;
  };
  const filterScript = path.join(work, "graph.txt");
  const preset = process.env.EDITOR_PRESET ?? (process.env.VERCEL ? "veryfast" : "medium");
  const inputs = { source: opts.source, output: opts.output, filterScript, fontFile: findFont(), textFile, music: opts.music, preset };
  await writeFile(filterScript, buildFilterGraph(plan, inputs));
  await Promise.all(texts);

  const r = await run(ffmpegBin(), buildFfmpegArgs(plan, inputs));
  if (r.code !== 0) throw new Error(`render failed: ${r.stderr.slice(-1500)}`);
  return plan;
}
