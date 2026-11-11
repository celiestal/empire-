# Promo video maker

Renders polished 1080x1920 promo videos for Empire (for X, Reels, TikTok, Shorts) from a small JSON spec. Each video gets:

- word-by-word animated captions, with `*starred*` words in the accent colour
- site screenshots in a floating card with a slow push-in, a cursor that taps a button and a highlight box
- a counting stat, an animated checklist, and an end card with a "Try Empire free" button being clicked, the link, and "Link in the post"
- zoom and crossfade transitions, a progress bar, an original synthesized beat, whooshes, clicks and an opening hit, mixed to about -14 LUFS

The video can't hold a clickable link (X doesn't allow that), so the link goes in the post text. The end card tells people it's there.

## Run it

Needs Python 3 with Pillow and numpy, and ffmpeg.

```bash
python3 marketing/promo/render.py 'marketing/promo/specs/*.json' --out-dir out/
python3 marketing/promo/render.py marketing/promo/specs/auto-editor.json out/auto-editor.mp4
python3 marketing/promo/render.py spec.json out.mp4 --preview 30,90,200   # saves those frames as PNGs instead
```

A 15 second video takes about 20 to 40 seconds to render and comes out at roughly 1.5 to 2 MB.

## Spec format

```json
{
  "id": "auto-editor",
  "accent": "#FFD400",
  "url": "empire-zeta-ecru.vercel.app",
  "scenes": [
    {"type": "hook", "duration": 2.6, "text": "Editing one short takes *2 hours.*", "punch": "Not anymore."},
    {"type": "feature", "duration": 3.4, "label": "AUTO EDITOR", "text": "Upload a raw take. Hit *one button.*", "shot": "editor_form", "tap_at": 2.5},
    {"type": "stat", "duration": 2.6, "top": "Raw take: 20.0 seconds", "from": 20.0, "to": 13.4, "suffix": "s", "text": "After Empire cut every *pause*"},
    {"type": "list", "duration": 3.4, "title": "Then it adds *everything*", "items": ["Punch-in zooms", "Word-by-word captions"]},
    {"type": "cta", "duration": 3.6, "text": "Your next short, edited in *minutes.*", "button": "Try Empire free  →"}
  ]
}
```

`accent`, `url`, `size` (font size) and `button` are optional. Keep hooks under about 8 words, feature captions under about 8 words, list items under about 30 characters, and the whole video between 12 and 18 seconds.

Scene types:

| type | fields |
| --- | --- |
| `hook` | `text`, optional `punch` (shown on an accent highlight bar) |
| `feature` | `text`, `shot` (a preset below), optional `label`, `tap_at` (seconds into the scene), `"tap": false`, `"focus": false` |
| `stat` | `from`, `to`, optional `decimals`, `prefix`, `suffix`, `top`, `text` |
| `list` | `title`, `items` (3 to 5) |
| `cta` | `text`, optional `button` |

Screenshot presets (`shot`), from `assets/studio.png` and `assets/editor.png`:

| shot | shows | extra |
| --- | --- | --- |
| `editor_form` | the Auto Editor upload form and the "Edit my video" button | cursor taps the button |
| `editor_result` | the result player (currently the colour test clip, so avoid it until the screenshot shows a real edit) | highlights the "Done" line |
| `editor_table` | the techniques table | pans down |
| `studio_week` | "This week" with the "Plan next week" button, and the Posts list | cursor taps the button |
| `studio_posts` | the Posts list | |
| `studio_gaps` | the content gap list | cursor taps "Add idea" |
| `studio_social` | the saved social handles | |
| `studio_brand` | brand hashtags and posting schedule | highlights the hashtags |

To use a fresh screenshot, replace the PNG in `assets/` and adjust the boxes in `SHOTS` in `render.py` (they're in the PNG's own pixels).

Fonts: Inter (SIL Open Font License 1.1, https://github.com/rsms/inter).
