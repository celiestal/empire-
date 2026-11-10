/**
 * Auto-edit a raw talking-head video into a hooky vertical short.
 *
 *   npx tsx scripts/auto-edit.ts input.mp4 output.mp4 \
 *     --hook "Most people price this wrong" \
 *     --script script.txt --emphasis "wrong,price" --music bed.mp3 --max 120
 *
 * Needs ffmpeg and ffprobe on PATH.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { autoEdit } from "../lib/video/render";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    hook: { type: "string" },
    script: { type: "string" },
    emphasis: { type: "string" },
    music: { type: "string" },
    max: { type: "string" },
    "no-sfx": { type: "boolean" },
  },
});

const [source, output] = positionals;
if (!source || !output) {
  console.error("Usage: tsx scripts/auto-edit.ts <input> <output> [--hook text] [--script file] [--emphasis a,b] [--music file] [--max seconds] [--no-sfx]");
  process.exit(1);
}

const scriptText = values.script ? await readFile(values.script, "utf8") : undefined;
const plan = await autoEdit({
  source,
  output,
  hookText: values.hook,
  scriptText,
  emphasisWords: values.emphasis?.split(",").map((s) => s.trim()),
  music: values.music,
  options: {
    ...(values.max ? { maxSeconds: Number(values.max) } : {}),
    ...(values["no-sfx"] ? { sfx: false } : {}),
  },
});

console.log(
  `Done: ${output}\n` +
    `  ${plan.sourceDuration.toFixed(1)}s in, ${plan.duration.toFixed(1)}s out (${plan.removedSeconds.toFixed(1)}s of pauses cut)\n` +
    `  ${plan.segments.length} cuts with punch-in zooms, ${plan.captions.length} captions, ${plan.sfx.length} sound effects`,
);
