/**
 * The auto editor's brain: turns a raw talking-head recording into an edit plan.
 * Pure functions only, so the same plan can be previewed in the browser, tested,
 * and rendered by ffmpeg (see ./ffmpeg.ts).
 */

export interface Interval {
  start: number;
  end: number;
}

export interface Word {
  text: string;
  /** Source-video time in seconds. */
  start: number;
  end: number;
}

export interface EditOptions {
  /** Pauses longer than this are cut (seconds). */
  minPause: number;
  /** Breath kept on each side of a cut so words aren't clipped (seconds). */
  pad: number;
  /** Segments shorter than this after cutting are dropped (seconds). */
  minSegment: number;
  /** Hard cap on the finished video's length (seconds). */
  maxSeconds: number;
  /** Punch-in scale for alternating segments. */
  punchIn: number;
  /** Scale the opening zoom starts from, easing to 1 over openZoomSeconds. */
  openZoom: number;
  openZoomSeconds: number;
  hookSeconds: number;
  /** Minimum gap between whoosh sound effects (seconds). */
  sfxMinGap: number;
  sfx: boolean;
  progressBar: boolean;
  wordsPerCaption: number;
}

export const DEFAULT_EDIT_OPTIONS: EditOptions = {
  minPause: 0.35,
  pad: 0.08,
  minSegment: 0.2,
  maxSeconds: 120,
  punchIn: 1.12,
  openZoom: 1.25,
  openZoomSeconds: 0.8,
  hookSeconds: 2.5,
  sfxMinGap: 2.5,
  sfx: true,
  progressBar: true,
  wordsPerCaption: 2,
};

export interface Segment {
  /** Source time. */
  start: number;
  end: number;
  /** Output time this segment starts at. */
  outStart: number;
  zoom: number;
  /** Only the first segment: animated zoom from openZoom to `zoom`. */
  openZoom: number | null;
}

export interface Caption {
  text: string;
  start: number;
  end: number;
  emphasis: boolean;
}

export interface SoundEffect {
  kind: "whoosh" | "hit";
  at: number;
}

export interface EditPlan {
  sourceDuration: number;
  duration: number;
  segments: Segment[];
  captions: Caption[];
  hook: { text: string; start: number; end: number } | null;
  sfx: SoundEffect[];
  progressBar: boolean;
  removedSeconds: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The parts of the source to keep: everything except long pauses (shrunk by `pad`). */
export function keepIntervals(duration: number, silences: Interval[], opts: EditOptions): Interval[] {
  const cuts = silences
    .filter((s) => s.end - s.start >= opts.minPause)
    .map((s) => ({ start: Math.max(0, s.start + opts.pad), end: Math.min(duration, s.end - opts.pad) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const keep: Interval[] = [];
  let cursor = 0;
  for (const c of cuts) {
    if (c.start > cursor) keep.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < duration) keep.push({ start: cursor, end: duration });
  return keep.filter((k) => k.end - k.start >= opts.minSegment).map((k) => ({ start: round(k.start), end: round(k.end) }));
}

/** Map a source time to output time, or null if it falls in a removed part. */
export function toOutputTime(t: number, segments: Segment[]): number | null {
  for (const s of segments) {
    if (t >= s.start && t <= s.end) return round(s.outStart + (t - s.start));
  }
  return null;
}

function clean(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

/** Split words into caption beats: at most `per` words, breaking early after punctuation. */
export function chunkWords<T extends { text: string }>(words: T[], per: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  for (const w of words) {
    current.push(w);
    if (current.length >= per || /[.!?,;:]$/.test(w.text)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Captions from word timestamps (accurate) when available, otherwise from the
 * script text spread across the speaking time in proportion to word length.
 */
export function buildCaptions(
  segments: Segment[],
  duration: number,
  opts: EditOptions,
  input: { words?: Word[]; scriptText?: string; emphasisWords?: string[] },
): Caption[] {
  const emphasis = new Set((input.emphasisWords ?? []).map(clean).filter(Boolean));
  const timed: { text: string; start: number; end: number }[] = [];

  if (input.words?.length) {
    for (const w of input.words) {
      const start = toOutputTime(w.start, segments);
      const end = toOutputTime(w.end, segments);
      if (start === null) continue;
      timed.push({ text: w.text, start, end: end ?? start + 0.25 });
    }
  } else if (input.scriptText?.trim()) {
    const words = input.scriptText.trim().split(/\s+/);
    const weights = words.map((w) => Math.max(2, w.length) + (/[.!?,]$/.test(w) ? 2 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = 0;
    words.forEach((w, i) => {
      const len = (weights[i] / total) * duration;
      timed.push({ text: w, start: round(t), end: round(t + len) });
      t += len;
    });
  }

  return chunkWords(timed, opts.wordsPerCaption).map((chunk) => {
    const hasEmphasis = chunk.some((w) => emphasis.has(clean(w.text)));
    const text = chunk.map((w) => w.text.replace(/[.,;:]+$/, "")).join(" ");
    return {
      text: hasEmphasis ? text.toUpperCase() : text,
      start: chunk[0].start,
      end: Math.min(duration, Math.max(chunk[chunk.length - 1].end, chunk[0].start + 0.2)),
      emphasis: hasEmphasis,
    };
  });
}

export function buildEditPlan(input: {
  duration: number;
  silences: Interval[];
  hookText?: string;
  words?: Word[];
  scriptText?: string;
  emphasisWords?: string[];
  options?: Partial<EditOptions>;
}): EditPlan {
  const opts = { ...DEFAULT_EDIT_OPTIONS, ...input.options };
  const keep = keepIntervals(input.duration, input.silences, opts);

  const segments: Segment[] = [];
  let out = 0;
  for (const k of keep) {
    if (out >= opts.maxSeconds) break;
    const len = Math.min(k.end - k.start, opts.maxSeconds - out);
    if (len < opts.minSegment) break;
    const i = segments.length;
    segments.push({
      start: k.start,
      end: round(k.start + len),
      outStart: round(out),
      zoom: i % 2 === 0 ? 1 : opts.punchIn,
      openZoom: i === 0 ? opts.openZoom : null,
    });
    out += len;
  }
  const duration = round(out);

  const sfx: SoundEffect[] = [];
  if (opts.sfx && segments.length) {
    sfx.push({ kind: "hit", at: 0 });
    let last = 0;
    for (const s of segments.slice(1)) {
      if (s.outStart - last >= opts.sfxMinGap) {
        sfx.push({ kind: "whoosh", at: round(Math.max(0, s.outStart - 0.12)) });
        last = s.outStart;
      }
    }
  }

  const hookText = input.hookText?.trim();
  return {
    sourceDuration: input.duration,
    duration,
    segments,
    captions: buildCaptions(segments, duration, opts, input),
    hook: hookText ? { text: hookText, start: 0, end: round(Math.min(opts.hookSeconds, duration)) } : null,
    sfx,
    progressBar: opts.progressBar,
    removedSeconds: round(input.duration - duration),
  };
}

/** Parse `ffmpeg -af silencedetect` stderr output into silent intervals. */
export function parseSilences(stderr: string, duration: number): Interval[] {
  const out: Interval[] = [];
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) open = Math.max(0, Number(s[1]));
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && open !== null) {
      out.push({ start: open, end: Number(e[1]) });
      open = null;
    }
  }
  if (open !== null) out.push({ start: open, end: duration });
  return out;
}
