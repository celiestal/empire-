/**
 * What top short-form videos do to hook and hold viewers, and how the auto editor
 * applies each one. Sources (vendor analyses, so treat the numbers as directional):
 *
 * - OpusClip, "50 Video Editing Tips" (13.5M clips analysed): captions on 80% of
 *   clips, 79% of those animated word-by-word; 1 to 2 words per caption beat;
 *   captions in the lower third above the bottom ~15% the app UI covers; cut every
 *   few seconds; a subtle zoom resets attention; duck music well under the voice;
 *   normalize loudness; loop the ending back to the opening.
 *   https://www.opus.pro/blog/video-editing-tips
 * - "Hook Engineering: the first 3 seconds" (dev.to, 2026): scroll decisions happen
 *   at ~1.4 s on Reels, ~1.7 s on TikTok; most views start muted, so the hook must
 *   work as on-screen text; a fast zoom with an audio hit in the first ~0.8 s is a
 *   common pattern interrupt; curiosity gaps hold best.
 *   https://dev.to/bulkdl/hook-engineering-the-science-of-the-first-3-seconds-in-short-form-video-2026-2jp9
 * - Fish Audio, "Using sound effects for short-form content": whooshes on
 *   transitions, impacts on jump cuts, risers before reveals, soft clicks on text.
 *   https://fish.audio/blog/using-sound-effects-for-short-form-content
 */

export interface Technique {
  id: string;
  name: string;
  why: string;
  howTheEditorDoesIt: string;
}

export const TECHNIQUES: Technique[] = [
  {
    id: "dead_air",
    name: "Cut every pause",
    why: "Silence is where people scroll away. Top clips cut every few seconds and end each beat early.",
    howTheEditorDoesIt: "Finds pauses longer than 0.35 s and removes them, keeping a short breath on each side so speech isn't clipped.",
  },
  {
    id: "punch_in",
    name: "Punch-in zooms",
    why: "A subtle reframe resets attention like a new shot, even from a single camera.",
    howTheEditorDoesIt: "Alternates between a wide frame and a 12% punch-in on every cut, so each jump cut also changes framing.",
  },
  {
    id: "open_zoom",
    name: "Moving first frame",
    why: "Viewers decide in about 1.4 seconds on Reels. Motion in the opening frame is a pattern interrupt.",
    howTheEditorDoesIt: "Starts with a fast zoom from 125% down to the normal frame over the first 0.8 s.",
  },
  {
    id: "hook_text",
    name: "Hook as on-screen text",
    why: "Most views start muted, so a hook that only exists in audio is lost.",
    howTheEditorDoesIt: "Shows the hook in large bold text near the top for the first 2.5 s.",
  },
  {
    id: "captions",
    name: "Word-by-word captions",
    why: "80% of top clips use captions and most animate them 1 to 2 words at a time.",
    howTheEditorDoesIt: "Burns in 1 to 2 word captions, white with a thick black outline, in the lower third above the app buttons. Key words are shown in caps and yellow.",
  },
  {
    id: "progress",
    name: "Progress bar",
    why: "Showing how little is left nudges people to finish, which lifts completion rate.",
    howTheEditorDoesIt: "Draws a thin bar along the top that fills as the video plays.",
  },
  {
    id: "sfx",
    name: "Sound on the cuts",
    why: "A whoosh on transitions and a hit on the opening make the edit feel fast even with audio low.",
    howTheEditorDoesIt: "Adds a short whoosh on cuts (at most one every 2.5 s so it doesn't get noisy) and a low hit on the first frame.",
  },
  {
    id: "music_duck",
    name: "Music under the voice",
    why: "Music fills gaps but must never compete with the words.",
    howTheEditorDoesIt: "If you add a music track it's mixed about 20 dB under the voice and ducks further whenever you speak.",
  },
  {
    id: "loudness",
    name: "Even loudness",
    why: "Quiet clips get skipped and platforms normalize anyway.",
    howTheEditorDoesIt: "Normalizes the final mix to -14 LUFS, the level most platforms target.",
  },
  {
    id: "vertical",
    name: "Full-screen vertical",
    why: "9:16 fills the phone screen, with no black bars.",
    howTheEditorDoesIt: "Center-crops and scales to 1080x1920.",
  },
  {
    id: "length",
    name: "Hard length cap",
    why: "Your plan is 1 minute target, 2 minutes max.",
    howTheEditorDoesIt: "Trims anything past the max length after pauses are removed.",
  },
];

/** Hook-writing rules fed to the script writer. */
export const HOOK_PLAYBOOK = [
  "Open on the problem or a surprising claim in the first sentence. No greetings, no 'hey guys', no intro.",
  "Curiosity gaps hold best: promise an answer the viewer only gets by watching (\"Most people price this wrong, here's why\").",
  "The hook must make sense with the sound off, so it also needs a 2 to 6 word on-screen version.",
  "Keep the spoken hook under 12 words; viewers decide whether to stay in about 1.5 seconds.",
  "Be specific: a number, a name, or a concrete result beats a vague promise.",
  "End by looping back to the opening line or asking a question, which drives replays and comments.",
];
