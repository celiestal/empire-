import { describe, expect, it } from "vitest";
import { buildFilterGraph, fitFontSize, wrapLines } from "@/lib/video/ffmpeg";
import { buildEditPlan, chunkWords, keepIntervals, parseSilences, toOutputTime, DEFAULT_EDIT_OPTIONS } from "@/lib/video/plan";

describe("edit plan", () => {
  it("cuts long pauses but keeps a breath, ignores short ones", () => {
    const keep = keepIntervals(10, [{ start: 2, end: 3 }, { start: 5, end: 5.2 }], DEFAULT_EDIT_OPTIONS);
    expect(keep).toEqual([{ start: 0, end: 2.08 }, { start: 2.92, end: 10 }]);
  });

  it("alternates punch-in zoom and opens with a zoom", () => {
    const plan = buildEditPlan({ duration: 12, silences: [{ start: 3, end: 4 }, { start: 7, end: 8 }] });
    expect(plan.segments.map((s) => s.zoom)).toEqual([1, 1.12, 1]);
    expect(plan.segments[0].openZoom).toBe(1.25);
    expect(plan.duration).toBeCloseTo(12 - 2 + 4 * 0.08, 2);
    expect(plan.sfx[0]).toEqual({ kind: "hit", at: 0 });
  });

  it("enforces the max length", () => {
    const plan = buildEditPlan({ duration: 300, silences: [], options: { maxSeconds: 120 } });
    expect(plan.duration).toBe(120);
  });

  it("maps source time to output time across cuts", () => {
    const plan = buildEditPlan({ duration: 10, silences: [{ start: 2, end: 4 }] });
    expect(toOutputTime(1, plan.segments)).toBe(1);
    expect(toOutputTime(3, plan.segments)).toBeNull();
    expect(toOutputTime(5, plan.segments)).toBeCloseTo(5 - (3.92 - 2.08), 3);
  });

  it("captions 1 to 2 words, breaks on punctuation, emphasizes key words", () => {
    expect(chunkWords([{ text: "Hi." }, { text: "you" }, { text: "are" }, { text: "here" }], 2).map((c) => c.length)).toEqual([1, 2, 1]);
    const plan = buildEditPlan({ duration: 6, silences: [], scriptText: "You price this wrong. Fix it now", emphasisWords: ["wrong"] });
    expect(plan.captions.map((c) => c.text)).toEqual(["You price", "THIS WRONG", "Fix it", "now"]);
    expect(plan.captions[1].emphasis).toBe(true);
    expect(plan.captions.at(-1)!.end).toBeLessThanOrEqual(plan.duration);
  });

  it("parses ffmpeg silencedetect output", () => {
    const err = "[silencedetect @ 0x1] silence_start: 1.5\n[silencedetect @ 0x1] silence_end: 2.75 | silence_duration: 1.25\n[silencedetect @ 0x1] silence_start: 9.1\n";
    expect(parseSilences(err, 10)).toEqual([{ start: 1.5, end: 2.75 }, { start: 9.1, end: 10 }]);
  });
});

describe("ffmpeg graph", () => {
  it("builds a graph with every element", () => {
    const plan = buildEditPlan({ duration: 12, silences: [{ start: 3, end: 6 }], hookText: "Stop doing this", scriptText: "one two three four" });
    const files: string[] = [];
    const graph = buildFilterGraph(plan, {
      source: "in.mp4", output: "out.mp4", filterScript: "g.txt", fontFile: "/f.ttf",
      textFile: (k) => { files.push(k); return `/tmp/${k}.txt`; }, music: "m.mp3",
    });
    expect(graph).toContain("concat=n=2:v=1:a=1");
    expect(graph).toContain("sidechaincompress");
    expect(graph).toContain("loudnorm=I=-14");
    expect(graph).toContain("overlay=x='-W+W*t/");
    expect(files).toContain("hook0");
    expect(files.filter((f) => f.startsWith("cap"))).toHaveLength(2);
  });

  it("wraps and sizes text to fit", () => {
    expect(wrapLines("You're pricing this completely wrong", 18)).toEqual(["You're pricing", "this completely", "wrong"]);
    expect(fitFontSize(["short"], 1080, 0.075)).toBe(81);
    expect(fitFontSize(["a very very long line of text here"], 1080, 0.075)).toBeLessThan(81);
  });
});
