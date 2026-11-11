import type { EditPlan } from "./plan";

/**
 * Turns an EditPlan into an ffmpeg filter graph and argument list.
 * Text for captions and the hook is passed through files (`textFile`), which
 * avoids ffmpeg's multi-level escaping rules entirely.
 */

export interface RenderInputs {
  source: string;
  output: string;
  /** Path of the file the filter graph is written to (passed with -filter_complex_script). */
  filterScript: string;
  fontFile: string;
  /** Returns the path of a file holding `text`; the caller writes the files. */
  textFile: (key: string, text: string) => string;
  music?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** x264 speed preset; "veryfast" keeps serverless renders inside the time limit. */
  preset?: string;
}

const f = (n: number) => n.toFixed(3);
const even = (n: number) => Math.round(n / 2) * 2;
const quote = (p: string) => `'${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;

/** Greedy word wrap to lines of at most `max` characters (a longer single word stays whole). */
export function wrapLines(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size (up to `base` x width) at which the longest line fits in 90% of the width. */
export function fitFontSize(lines: string[], width: number, base: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  // Bold sans glyphs average roughly 0.6 em wide.
  return Math.round(Math.min(width * base, (width * 0.9) / (longest * 0.6)));
}

/** ASS time: h:mm:ss.cc */
export function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

const assText = (t: string) => t.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, " ");

/** Font family name of the bundled font, used by libass to find it in fontsdir. */
export const FONT_FAMILY = "DejaVu Sans";

/**
 * The hook (top, white on a dark box) and captions (lower third, white with a
 * black outline, emphasis words bigger and yellow) as an ASS subtitle file.
 */
export function buildAss(plan: EditPlan, W: number, H: number): string {
  const hookLines = plan.hook ? wrapLines(plan.hook.text, 18) : [];
  const hookSize = fitFontSize(hookLines, W, 0.075);
  const outline = Math.round(W * 0.007);
  const out = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // BorderStyle 3 draws an opaque box in OutlineColour (alpha 40 = 75% opaque black).
    `Style: Hook,${FONT_FAMILY},${hookSize},&H00FFFFFF,&H00FFFFFF,&H40000000,&H40000000,-1,0,0,0,100,100,0,0,3,${Math.round(hookSize * 0.3)},0,8,40,40,${Math.round(H * 0.12)},1`,
    `Style: Cap,${FONT_FAMILY},${Math.round(W * 0.078)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${outline},0,2,40,40,${Math.round(H * 0.25)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  if (plan.hook) {
    out.push(`Dialogue: 1,${assTime(plan.hook.start)},${assTime(plan.hook.end)},Hook,,0,0,0,,${hookLines.map(assText).join("\\N")}`);
  }
  for (const c of plan.captions) {
    const size = fitFontSize([c.text], W, c.emphasis ? 0.088 : 0.078);
    const style = c.emphasis ? `{\\fs${size}\\c&H0000D4FF&}` : `{\\fs${size}}`;
    out.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap,,0,0,0,,${style}${assText(c.text)}`);
  }
  return out.join("\n") + "\n";
}

export function buildFilterGraph(plan: EditPlan, inp: RenderInputs): string {
  const W = inp.width ?? 1080;
  const H = inp.height ?? 1920;
  const fps = inp.fps ?? 30;
  const lines: string[] = [];
  const n = plan.segments.length;
  if (!n) throw new Error("Nothing left to render: the whole video was silence.");

  // 1. Cut, fill the 9:16 frame, and zoom each kept segment.
  plan.segments.forEach((s, i) => {
    const fill = `crop='min(iw,ih*${W}/${H})':'min(ih,iw*${H}/${W})',scale=${W}:${H},setsar=1`;
    let zoom = "";
    if (s.openZoom && s.openZoom !== s.zoom) {
      const from = s.openZoom;
      const to = s.zoom;
      const dur = 0.8;
      const z = `(${to}+(${from}-${to})*max(0,1-t/${dur}))`;
      zoom = `,scale=w='trunc(${W}*${z}/2)*2':h='trunc(${H}*${z}/2)*2':eval=frame,crop=${W}:${H}`;
    } else if (s.zoom !== 1) {
      zoom = `,scale=${even(W * s.zoom)}:${even(H * s.zoom)},crop=${W}:${H}`;
    }
    lines.push(
      `[0:v]trim=start=${f(s.start)}:end=${f(s.end)},setpts=PTS-STARTPTS,fps=${fps},${fill}${zoom},setsar=1[v${i}]`,
    );
    const fade = Math.min(0.01, (s.end - s.start) / 4);
    lines.push(
      `[0:a]atrim=start=${f(s.start)}:end=${f(s.end)},asetpts=PTS-STARTPTS,afade=t=in:d=${f(fade)},areverse,afade=t=in:d=${f(fade)},areverse[a${i}]`,
    );
  });
  lines.push(`${plan.segments.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[vcat][voice]`);

  // 2. Overlays: progress bar, hook text, captions.
  let v = "vcat";
  if (plan.progressBar) {
    lines.push(`color=c=0xFFD400:s=${W}x14:r=${fps}[bar]`);
    lines.push(`[${v}][bar]overlay=x='-W+W*t/${f(Math.max(plan.duration, 0.1))}':y=0:shortest=1[vbar]`);
    v = "vbar";
  }

  // Hook and captions are drawn from one ASS subtitle file (libass), which
  // the bundled ffmpeg supports and which needs no filter-level text escaping.
  if (plan.hook || plan.captions.length) {
    const assPath = inp.textFile("subs.ass", buildAss(plan, W, H));
    const fontPath = inp.fontFile.replace(/\\/g, "/");
    const cut = fontPath.lastIndexOf("/");
    const fontsDir = cut > 0 ? fontPath.slice(0, cut) : cut === 0 ? "/" : ".";
    lines.push(`[${v}]ass=filename=${quote(assPath)}:fontsdir=${quote(fontsDir)}[vout]`);
  } else {
    lines.push(`[${v}]null[vout]`);
  }

  // 3. Audio: sound effects, optional ducked music, loudness.
  const mix: string[] = ["[voice]"];
  const hits = plan.sfx.filter((s) => s.kind === "hit");
  const whooshes = plan.sfx.filter((s) => s.kind === "whoosh");
  if (hits.length) {
    lines.push(
      `sine=f=55:d=0.35,afade=t=out:st=0.05:d=0.3,volume=0.9,adelay=${Math.round(hits[0].at * 1000)}:all=1[hit]`,
    );
    mix.push("[hit]");
  }
  if (whooshes.length) {
    lines.push(
      `anoisesrc=d=0.4:c=pink:a=0.6,bandpass=f=1800:width_type=o:w=2,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.15,volume=0.35,asplit=${whooshes.length}${whooshes.map((_, i) => `[w${i}]`).join("")}`,
    );
    whooshes.forEach((s, i) => {
      lines.push(`[w${i}]adelay=${Math.round(s.at * 1000)}:all=1[wd${i}]`);
      mix.push(`[wd${i}]`);
    });
  }
  if (inp.music) {
    // Split the voice: one copy is heard, one drives the music's ducking.
    mix[0] = "[voicemain]";
    lines.push(`[voice]asplit=2[voicemain][voicekey]`);
    lines.push(`[1:a]volume=0.12,aresample=48000[musicraw]`);
    lines.push(`[musicraw][voicekey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[music]`);
    mix.push("[music]");
  }
  lines.push(
    `${mix.join("")}amix=inputs=${mix.length}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`,
  );

  return lines.join(";\n");
}

export function buildFfmpegArgs(plan: EditPlan, inp: RenderInputs): string[] {
  const args = ["-y", "-i", inp.source];
  if (inp.music) args.push("-stream_loop", "-1", "-i", inp.music);
  args.push(
    "-filter_complex_script",
    inp.filterScript,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    plan.duration.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    inp.preset ?? "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    inp.output,
  );
  return args;
}
