#!/usr/bin/env python3
"""Render polished 1080x1920 promo videos for Empire from a JSON spec.

Usage:
    python3 marketing/promo/render.py specs/auto-editor.json out/auto-editor.mp4
    python3 marketing/promo/render.py specs/*.json --out-dir out/

Needs Python 3 with Pillow and numpy, plus ffmpeg on PATH.
See README.md in this folder for the spec format and the screenshot presets.
"""
import argparse
import glob
import json
import math
import os
import subprocess
import sys
import tempfile
import wave
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

BG_TOP = (9, 9, 14)
BG_BOTTOM = (24, 19, 36)
WHITE = (255, 255, 255)
MUTED = (160, 160, 178)
INK = (12, 12, 16)
DEFAULT_ACCENT = "#FFD400"
DEFAULT_URL = "empire-zeta-ecru.vercel.app"

# Screenshot regions (in the original PNG's pixels) that specs can refer to by name.
# "tap" is a point to click on, "focus" a box to outline.
SHOTS = {
    "editor_form": {"image": "editor.png", "box": [118, 268, 630, 752], "tap": [198, 667]},
    "editor_result": {"image": "editor.png", "box": [118, 690, 760, 1420], "focus": [128, 698, 756, 746]},
    "editor_table": {"image": "editor.png", "box": [118, 1440, 720, 2330]},
    "studio_week": {"image": "studio.png", "box": [116, 150, 636, 640], "tap": [273, 270]},
    "studio_posts": {"image": "studio.png", "box": [116, 340, 636, 640]},
    "studio_gaps": {"image": "studio.png", "box": [646, 340, 1168, 640], "tap": [921, 528]},
    "studio_social": {"image": "studio.png", "box": [116, 664, 636, 1235]},
    "studio_brand": {"image": "studio.png", "box": [646, 664, 1168, 1235], "focus": [668, 750, 1144, 873]},
}


# ---------------------------------------------------------------- helpers

def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_back(x, s=1.6):
    x = clamp(x) - 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


@lru_cache(maxsize=64)
def font(name, size):
    for p in (os.path.join(ASSETS, "fonts", name), f"/usr/share/fonts/opentype/inter/{name}"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    fallback = os.path.join(HERE, "..", "..", "lib", "video", "fonts", "DejaVuSans-Bold.ttf")
    return ImageFont.truetype(fallback, size)


@lru_cache(maxsize=8)
def screenshot(name):
    return Image.open(os.path.join(ASSETS, name)).convert("RGB")


def with_alpha(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    alpha = im.getchannel("A").point(lambda v: int(v * a))
    im.putalpha(alpha)
    return im


def paste_center(canvas, sprite, cx, cy, scale=1.0, alpha=1.0):
    if alpha <= 0.01 or scale <= 0.01:
        return
    if abs(scale - 1) > 0.005:
        sw, sh = max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))
        sprite = sprite.resize((sw, sh), Image.BICUBIC)
    sprite = with_alpha(sprite, alpha)
    canvas.alpha_composite(sprite, (int(round(cx - sprite.width / 2)), int(round(cy - sprite.height / 2))))


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=255)
    return m


def shadow_sprite(size, r, blur=34, opacity=190, spread=10):
    pad = blur * 3
    im = Image.new("RGBA", (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle(
        [pad - spread, pad - spread + 24, pad + size[0] + spread, pad + size[1] + spread + 24], r, fill=(0, 0, 0, opacity))
    return im.filter(ImageFilter.GaussianBlur(blur)), pad


# ---------------------------------------------------------------- text

def parse_words(text):
    out = []
    for w in text.split():
        accent = "*" in w
        out.append((w.replace("*", ""), accent))
    return out


@lru_cache(maxsize=512)
def word_sprite(word, font_name, size, color, shadow=True):
    f = font(font_name, size)
    l, t, r, b = f.getbbox(word)
    pad = 30
    im = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((pad - l, pad - t + 8), word, font=f, fill=(0, 0, 0, 200))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(im).text((pad - l, pad - t), word, font=f, fill=color)
    return im, l - pad, t - pad


class TextBlock:
    """Words laid out in centred lines; each word pops in on its own."""

    def __init__(self, text, size, accent, top, color=WHITE, font_name="InterDisplay-Black.otf",
                 max_w=W - 150, line_gap=0.08, shadow=True):
        self.size, self.font_name, self.shadow = size, font_name, shadow
        f = font(font_name, size)
        asc, desc = f.getmetrics()
        self.line_h = int((asc + desc) * (1 + line_gap))
        space = f.getlength(" ")
        lines, cur = [[]], 0.0
        for word, is_acc in parse_words(text):
            wl = f.getlength(word)
            if lines[-1] and cur + space + wl > max_w:
                lines.append([])
                cur = 0.0
            if lines[-1]:
                cur += space
            lines[-1].append((word, is_acc, cur, wl))
            cur += wl
        self.items = []
        self.top = top
        self.boxes = []
        for i, line in enumerate(lines):
            lw = line[-1][2] + line[-1][3] if line else 0
            x0 = (W - lw) / 2
            y = top + i * self.line_h
            self.boxes.append((x0, y, x0 + lw, y + self.line_h))
            for word, is_acc, xo, wl in line:
                col = accent if is_acc else color
                sprite, ox, oy = word_sprite(word, font_name, size, col, shadow)
                cx = x0 + xo + ox + sprite.width / 2
                cy = y + oy + sprite.height / 2
                self.items.append((sprite, cx, cy))
        self.bottom = top + len(lines) * self.line_h

    def bounds(self):
        xs = [b[0] for b in self.boxes] + [b[2] for b in self.boxes]
        return min(xs), self.top, max(xs), self.bottom

    def draw(self, canvas, t, start=0.0, stagger=0.08, dur=0.38, alpha=1.0):
        for i, (sprite, cx, cy) in enumerate(self.items):
            p = (t - start - i * stagger) / dur
            if p <= 0:
                continue
            s = 0.72 + 0.28 * ease_back(p)
            a = ease_out(p * 1.6) * alpha
            dy = (1 - ease_out(p)) * 34
            paste_center(canvas, sprite, cx, cy + dy, s, a)

    def done_at(self, start=0.0, stagger=0.08, dur=0.38):
        return start + max(0, len(self.items) - 1) * stagger + dur


def draw_text_center(canvas, text, font_name, size, color, cy, alpha=1.0):
    f = font(font_name, size)
    l, t, r, b = f.getbbox(text)
    im = Image.new("RGBA", (r - l + 20, b - t + 20), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10 - l, 10 - t), text, font=f, fill=color)
    paste_center(canvas, im, W / 2, cy, 1.0, alpha)
    return r - l, b - t


def chip(canvas, text, accent, cy, alpha=1.0):
    f = font("Inter-Bold.otf", 34)
    l, t, r, b = f.getbbox(text)
    tw, th = r - l, b - t
    pw, ph = tw + 64, th + 34
    im = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, pw - 1, ph - 1], ph // 2, fill=accent + (38,), outline=accent + (200,), width=2)
    d.text(((pw - tw) / 2 - l, (ph - th) / 2 - t), text, font=f, fill=accent)
    paste_center(canvas, im, W / 2, cy, 1.0, alpha)


# ---------------------------------------------------------------- cursor and tap

@lru_cache(maxsize=2)
def cursor_sprite():
    s = 4
    pts = [(0, 0), (0, 66), (16, 51), (28, 78), (40, 72), (28, 46), (50, 46)]
    big = Image.new("RGBA", (64 * s, 92 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    off = (6 * s, 4 * s)
    poly = [(x * s + off[0], y * s + off[1]) for x, y in pts]
    d.polygon(poly, fill=(0, 0, 0, 255))
    inner = [(x * s * 0.86 + off[0] + 3.2 * s, y * s * 0.86 + off[1] + 5.5 * s) for x, y in pts]
    d.polygon(inner, fill=(255, 255, 255, 255))
    im = big.resize((64 * 2, 92 * 2), Image.LANCZOS)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(im.getchannel("A").point(lambda v: int(v * 0.5)))
    out = Image.new("RGBA", (im.width + 40, im.height + 40), (0, 0, 0, 0))
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)), (26, 30))
    out.alpha_composite(im, (20, 20))
    return out, (20 + 6 * 2, 20 + 4 * 2)  # sprite and its hotspot


def draw_cursor_tap(canvas, t, target, tap_t, accent, enter=0.75):
    """Cursor glides in, taps the target at tap_t and leaves a ripple."""
    if t < tap_t - enter:
        return
    sprite, hot = cursor_sprite()
    sx, sy = W + 60, H - 260
    p = ease_in_out((t - (tap_t - enter)) / (enter - 0.1))
    x = sx + (target[0] - sx) * p
    y = sy + (target[1] - sy) * p + math.sin(p * math.pi) * -90
    press = 1.0
    if tap_t <= t < tap_t + 0.16:
        press = 0.84
    dt = t - tap_t
    if 0 <= dt < 0.6:
        q = dt / 0.6
        r = 26 + 110 * ease_out(q)
        ring = Image.new("RGBA", (int(r * 2 + 12), int(r * 2 + 12)), (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse([6, 6, ring.width - 6, ring.height - 6], outline=accent + (int(255 * (1 - q)),), width=8)
        ImageDraw.Draw(ring).ellipse([ring.width / 2 - r * 0.45, ring.height / 2 - r * 0.45, ring.width / 2 + r * 0.45, ring.height / 2 + r * 0.45],
                                     fill=WHITE + (int(110 * (1 - q)),))
        canvas.alpha_composite(ring, (int(target[0] - ring.width / 2), int(target[1] - ring.height / 2)))
    sw = int(sprite.width * press)
    sp = sprite.resize((sw, int(sprite.height * press)), Image.BICUBIC) if press != 1 else sprite
    canvas.alpha_composite(sp, (int(x - hot[0] * press), int(y - hot[1] * press)))


# ---------------------------------------------------------------- background

class Background:
    def __init__(self, accent):
        y = np.linspace(0, 1, H)[:, None, None]
        top, bot = np.array(BG_TOP, float), np.array(BG_BOTTOM, float)
        arr = (top + (bot - top) * y).repeat(W, axis=1).astype(np.uint8)
        self.base = Image.fromarray(arr, "RGB").convert("RGBA")
        self.glow_a = self._glow(1300, accent, 58)
        self.glow_b = self._glow(1200, (120, 92, 255), 52)

    @staticmethod
    def _glow(size, color, peak):
        r = size / 2
        yy, xx = np.mgrid[0:size, 0:size]
        d = np.sqrt((xx - r) ** 2 + (yy - r) ** 2) / r
        a = (np.clip(1 - d, 0, 1) ** 2.2 * peak).astype(np.uint8)
        arr = np.zeros((size, size, 4), np.uint8)
        arr[..., :3] = color
        arr[..., 3] = a
        return Image.fromarray(arr, "RGBA")

    def frame(self, t, strength=1.0):
        im = self.base.copy()
        ax = int(-420 + 160 * math.sin(t * 0.45))
        ay = int(-380 + 120 * math.cos(t * 0.35))
        bx = int(W - 760 + 140 * math.cos(t * 0.4))
        by = int(H - 900 + 160 * math.sin(t * 0.3))
        im.alpha_composite(with_alpha(self.glow_a, strength), (ax, ay))
        im.alpha_composite(with_alpha(self.glow_b, strength), (bx, by))
        return im


# ---------------------------------------------------------------- scenes

class Scene:
    whoosh = True

    def __init__(self, spec, ctx):
        self.spec, self.ctx = spec, ctx
        self.duration = float(spec.get("duration", 3.0))
        self.taps = []  # times (scene-relative) for click sounds

    def render(self, canvas, t):
        raise NotImplementedError


class HookScene(Scene):
    def __init__(self, spec, ctx):
        super().__init__(spec, ctx)
        size = int(spec.get("size", 112))
        self.main = TextBlock(spec["text"], size, ctx["accent"], top=0)
        h = self.main.bottom
        punch = spec.get("punch")
        self.punch = None
        total = h
        if punch:
            self.punch = TextBlock(punch, int(size * 0.92), INK, top=0, color=INK, shadow=False)
            total = h + 70 + self.punch.bottom
        top = int(H * 0.44 - total / 2)
        self.main = TextBlock(spec["text"], size, ctx["accent"], top=top)
        if punch:
            self.punch = TextBlock(punch, int(size * 0.92), INK, top=self.main.bottom + 70, color=INK, shadow=False)
        self.punch_t = self.main.done_at(0.1) + 0.25

    def render(self, canvas, t):
        self.main.draw(canvas, t, start=0.1)
        if self.punch:
            p = ease_out((t - self.punch_t) / 0.32)
            if p > 0:
                x0, y0, x1, y1 = self.punch.bounds()
                pad = 26
                d = ImageDraw.Draw(canvas)
                d.rounded_rectangle([x0 - pad, y0 - 6, x0 - pad + (x1 - x0 + pad * 2) * p, y1 + 2], 18, fill=self.ctx["accent"] + (255,))
            self.punch.draw(canvas, t, start=self.punch_t + 0.12, stagger=0.05, dur=0.3)


class FeatureScene(Scene):
    def __init__(self, spec, ctx):
        super().__init__(spec, ctx)
        shot = dict(SHOTS.get(spec.get("shot", ""), {}))
        shot.update({k: spec[k] for k in ("image", "box", "tap", "focus") if k in spec})
        self.img = screenshot(shot["image"])
        self.box = shot["box"]
        self.tap = shot.get("tap") if spec.get("tap", True) is not False else None
        self.focus = shot.get("focus") if spec.get("focus", True) is not False else None
        self.label = spec.get("label")
        self.caption = TextBlock(spec["text"], int(spec.get("size", 76)), ctx["accent"], top=250)
        cap_bottom = self.caption.bottom
        self.card_top = int(cap_bottom + 70)
        self.cw = 960
        bw, bh = self.box[2] - self.box[0], self.box[3] - self.box[1]
        max_h = 1760 - self.card_top
        natural = self.cw * bh / bw
        self.ch = int(min(natural, max_h))
        self.pan = natural > max_h
        if self.ch < 520:  # short strips look better a bit zoomed in
            self.ch = int(min(max_h, 560))
        self.card_top = int(self.card_top + (max_h - self.ch) * 0.35)
        self.mask = rounded_mask((self.cw, self.ch), 34)
        self.shadow, self.shadow_pad = shadow_sprite((self.cw, self.ch), 34)
        self.tap_t = float(spec.get("tap_at", self.duration - 1.0))
        if self.tap:
            self.taps.append(self.tap_t)

    def window(self, t):
        x0, y0, x1, y1 = self.box
        bw, bh = x1 - x0, y1 - y0
        aspect = self.ch / self.cw
        if bh / bw > aspect:  # pan down through a tall region
            wh = bw * aspect
            p = ease_in_out((t - 0.4) / max(0.5, self.duration - 0.8))
            return x0, y0 + (bh - wh) * p, bw, wh
        # wide region: fit height, then slow push-in towards the tap point
        wh = bh
        ww = wh / aspect
        if ww > bw:
            ww = bw
            wh = ww * aspect
        z = 1 + 0.10 * ease_in_out(t / self.duration)
        ww2, wh2 = ww / z, wh / z
        fx, fy = (self.tap if self.tap else ((x0 + x1) / 2, (y0 + y1) / 2))
        cx = clamp(fx, x0 + ww2 / 2, x1 - ww2 / 2) if ww2 < bw else (x0 + x1) / 2
        cy = clamp(fy, y0 + wh2 / 2, y1 - wh2 / 2) if wh2 < bh else (y0 + y1) / 2
        # keep a little of the original centring so the push-in is gentle
        bcx, bcy = (x0 + x1) / 2, (y0 + y1) / 2
        k = ease_in_out(t / self.duration)
        cx, cy = bcx + (cx - bcx) * k, bcy + (cy - bcy) * k
        return cx - ww2 / 2, cy - wh2 / 2, ww2, wh2

    def to_screen(self, pt, win, card_x, card_y):
        wx, wy, ww, wh = win
        return card_x + (pt[0] - wx) / ww * self.cw, card_y + (pt[1] - wy) / wh * self.ch

    def render(self, canvas, t):
        accent = self.ctx["accent"]
        if self.label:
            chip(canvas, self.label, accent, 170, ease_out(t / 0.3))
        self.caption.draw(canvas, t, start=0.05, stagger=0.06)
        p = ease_out((t - 0.12) / 0.55)
        if p <= 0:
            return
        card_x = (W - self.cw) // 2
        card_y = int(self.card_top + (1 - p) * 260)
        win = self.window(t)
        wx, wy, ww, wh = win
        crop = self.img.crop((int(wx), int(wy), int(wx + ww), int(wy + wh))).resize((self.cw, self.ch), Image.BICUBIC)
        card = crop.convert("RGBA")
        card.putalpha(self.mask)
        canvas.alpha_composite(with_alpha(self.shadow, p), (card_x - self.shadow_pad, card_y - self.shadow_pad))
        canvas.alpha_composite(with_alpha(card, p), (card_x, card_y))
        d = ImageDraw.Draw(canvas)
        d.rounded_rectangle([card_x, card_y, card_x + self.cw - 1, card_y + self.ch - 1], 34, outline=(60, 58, 78, int(255 * p)), width=2)
        if self.focus:
            fp = ease_out((t - 0.9) / 0.45)
            if fp > 0:
                a = self.to_screen(self.focus[:2], win, card_x, card_y)
                b = self.to_screen(self.focus[2:], win, card_x, card_y)
                pulse = 0.75 + 0.25 * math.sin(t * 7)
                grow = (1 - fp) * 30
                d.rounded_rectangle([a[0] - 10 - grow, a[1] - 10 - grow, b[0] + 10 + grow, b[1] + 10 + grow], 18,
                                    outline=accent + (int(255 * fp * pulse),), width=6)
        if self.tap:
            target = self.to_screen(self.tap, win, card_x, card_y)
            draw_cursor_tap(canvas, t, target, self.tap_t, accent)


class StatScene(Scene):
    def __init__(self, spec, ctx):
        super().__init__(spec, ctx)
        self.top_text = spec.get("top", "")
        self.bottom = TextBlock(spec.get("text", ""), int(spec.get("size", 68)), ctx["accent"], top=1130)
        self.a, self.b = float(spec["from"]), float(spec["to"])
        self.dec = int(spec.get("decimals", 1))
        self.suffix = spec.get("suffix", "")
        self.prefix = spec.get("prefix", "")

    def render(self, canvas, t):
        accent = self.ctx["accent"]
        if self.top_text:
            draw_text_center(canvas, self.top_text, "Inter-SemiBold.otf", 52, MUTED, 640, ease_out(t / 0.3))
        p = ease_out((t - 0.25) / 1.1)
        v = self.a + (self.b - self.a) * p
        txt = f"{self.prefix}{v:.{self.dec}f}{self.suffix}"
        pop = 1.0 + 0.06 * math.sin(clamp((t - 1.35) / 0.25) * math.pi)
        f = font("InterDisplay-Black.otf", 300)
        l, tt, r, b = f.getbbox(txt)
        im = Image.new("RGBA", (r - l + 60, b - tt + 60), (0, 0, 0, 0))
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((30 - l, 40 - tt), txt, font=f, fill=(0, 0, 0, 200))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
        ImageDraw.Draw(im).text((30 - l, 30 - tt), txt, font=f, fill=accent if p >= 0.999 else WHITE)
        paste_center(canvas, im, W / 2, 880, pop * (0.8 + 0.2 * ease_back(t / 0.4)), ease_out(t / 0.25))
        self.bottom.draw(canvas, t, start=1.2, stagger=0.06)


class ListScene(Scene):
    def __init__(self, spec, ctx):
        super().__init__(spec, ctx)
        self.title = TextBlock(spec["title"], int(spec.get("size", 84)), ctx["accent"], top=330)
        self.items = spec["items"]
        self.row_h = 150
        self.start_y = self.title.bottom + 110
        self.f = font("Inter-Bold.otf", 56)

    def render(self, canvas, t):
        accent = self.ctx["accent"]
        self.title.draw(canvas, t, start=0.05, stagger=0.06)
        t0 = self.title.done_at(0.05, 0.06)
        gap = min(0.42, (self.duration - t0 - 0.6) / max(1, len(self.items)))
        for i, text in enumerate(self.items):
            p = ease_out((t - t0 - i * gap) / 0.4)
            if p <= 0:
                continue
            y = self.start_y + i * self.row_h
            x = 150 - (1 - p) * 120
            row = Image.new("RGBA", (W - 200, 120), (0, 0, 0, 0))
            d = ImageDraw.Draw(row)
            d.rounded_rectangle([0, 0, row.width - 1, row.height - 1], 30, fill=(255, 255, 255, 16), outline=(255, 255, 255, 34), width=2)
            d.ellipse([28, 28, 92, 92], fill=accent + (255,))
            cp = ease_out((t - t0 - i * gap - 0.15) / 0.25)
            if cp > 0:
                a, b, c = (44, 61), (56, 74), (78, 46)
                if cp < 0.5:
                    q = cp / 0.5
                    d.line([a, (a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q)], fill=INK, width=9)
                else:
                    q = (cp - 0.5) / 0.5
                    d.line([a, b, (b[0] + (c[0] - b[0]) * q, b[1] + (c[1] - b[1]) * q)], fill=INK, width=9, joint="curve")
            f = self.f
            size = 56
            while f.getlength(text) > row.width - 160 and size > 34:
                size -= 2
                f = font("Inter-Bold.otf", size)
            l, tt, r, bb = f.getbbox(text)
            d.text((122 - l, (row.height - (bb - tt)) / 2 - tt), text, font=f, fill=WHITE)
            canvas.alpha_composite(with_alpha(row, p), (int(x - 50), int(y)))


class CtaScene(Scene):
    def __init__(self, spec, ctx):
        super().__init__(spec, ctx)
        self.headline = TextBlock(spec.get("text", "Your next short, done in minutes."), int(spec.get("size", 70)), ctx["accent"], top=720)
        self.button = spec.get("button", "Try Empire free  →")
        self.url = ctx["url"]
        self.tap_t = 1.75
        self.taps.append(self.tap_t)
        self.btn_y = max(1110, self.headline.bottom + 150)

    def render(self, canvas, t):
        accent = self.ctx["accent"]
        f = font("InterDisplay-Black.otf", 150)
        word = "EMPIRE"
        tracking = 14
        widths = [f.getlength(c) for c in word]
        total = sum(widths) + tracking * (len(word) - 1)
        x = (W - total) / 2
        for i, c in enumerate(word):
            p = (t - 0.05 - i * 0.04) / 0.4
            if p > 0:
                sprite, ox, oy = word_sprite(c, "InterDisplay-Black.otf", 150, WHITE, True)
                paste_center(canvas, sprite, x + ox + sprite.width / 2, 520 + oy + sprite.height / 2 + (1 - ease_out(p)) * 40,
                             0.7 + 0.3 * ease_back(p), ease_out(p * 1.5))
            x += widths[i] + tracking
        self.headline.draw(canvas, t, start=0.35, stagger=0.06)
        # button
        bp = (t - 0.8) / 0.45
        if bp > 0:
            bf = font("InterDisplay-Black.otf", 62)
            l, tt, r, b = bf.getbbox(self.button)
            bw, bh = max(720, r - l + 140), 160
            btn = Image.new("RGBA", (bw + 80, bh + 80), (0, 0, 0, 0))
            glow = Image.new("RGBA", btn.size, (0, 0, 0, 0))
            pulse = 0.55 + 0.45 * (0.5 + 0.5 * math.sin(t * 5))
            ImageDraw.Draw(glow).rounded_rectangle([30, 34, bw + 50, bh + 50], bh // 2, fill=accent + (int(150 * pulse),))
            btn.alpha_composite(glow.filter(ImageFilter.GaussianBlur(22)))
            d = ImageDraw.Draw(btn)
            d.rounded_rectangle([40, 40, bw + 39, bh + 39], bh // 2, fill=accent + (255,))
            d.text((40 + (bw - (r - l)) / 2 - l, 40 + (bh - (b - tt)) / 2 - tt), self.button, font=bf, fill=INK)
            press = 0.93 if self.tap_t <= t < self.tap_t + 0.16 else 1.0
            paste_center(canvas, btn, W / 2, self.btn_y, (0.6 + 0.4 * ease_back(bp)) * press, ease_out(bp * 1.4))
        draw_cursor_tap(canvas, t, (W / 2 + 120, self.btn_y + 20), self.tap_t, accent, enter=0.8)
        up = ease_out((t - 2.05) / 0.4)
        if up > 0:
            uf = font("Inter-Bold.otf", 50)
            l, tt, r, b = uf.getbbox(self.url)
            pw, ph = r - l + 80, b - tt + 50
            pill = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
            d = ImageDraw.Draw(pill)
            d.rounded_rectangle([0, 0, pw - 1, ph - 1], ph // 2, fill=(255, 255, 255, 22), outline=(255, 255, 255, 60), width=2)
            d.text((40 - l, 25 - tt), self.url, font=uf, fill=WHITE)
            paste_center(canvas, pill, W / 2, self.btn_y + 200 + (1 - up) * 30, 1.0, up)
        lp = ease_out((t - 2.35) / 0.4)
        if lp > 0:
            bounce = abs(math.sin(t * 4)) * 14
            draw_text_center(canvas, "Link in the post  ↓", "Inter-SemiBold.otf", 46, MUTED, self.btn_y + 330 + bounce * 0.4, lp)


SCENES = {"hook": HookScene, "feature": FeatureScene, "stat": StatScene, "list": ListScene, "cta": CtaScene}


# ---------------------------------------------------------------- audio

def one_pole(x, coeffs):
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += coeffs[i] * (x[i] - acc)
        y[i] = acc
    return y


def add(buf, clip, start):
    start = int(start)
    if start >= len(buf):
        return
    if start < 0:
        clip = clip[-start:]
        start = 0
    end = min(len(buf), start + len(clip))
    buf[start:end] += clip[:end - start]


def synth_audio(total, scene_starts, taps, seed=7, bpm=112):
    rng = np.random.default_rng(seed)
    n = int(total * SR)
    t = np.arange(n) / SR
    beat = 60 / bpm
    music = np.zeros(n)
    # kick
    kl = int(0.4 * SR)
    kt = np.arange(kl) / SR
    kick = np.sin(2 * np.pi * np.cumsum(46 + 95 * np.exp(-kt * 30)) / SR) * np.exp(-kt * 8.5)
    # hat
    hl = int(0.06 * SR)
    hn = np.diff(rng.standard_normal(hl + 1)) * np.exp(-np.arange(hl) / SR * 70)
    # clap on 2 and 4
    cl = int(0.18 * SR)
    clap = np.diff(rng.standard_normal(cl + 1))
    clap = one_pole(clap, np.full(cl, 0.35)) * np.exp(-np.arange(cl) / SR * 22)
    for b in range(int(total / beat) + 1):
        s = b * beat * SR
        add(music, kick * 0.9, s)
        add(music, hn * 0.18, s + beat * SR / 2)
        if b % 2 == 1:
            add(music, clap * 0.55, s)
    # pad + bass, A minor: Am F C G
    chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    bar = 4 * beat
    pad = np.zeros(n)
    bass = np.zeros(n)
    for i in range(int(total / bar) + 1):
        s, e = int(i * bar * SR), min(n, int((i + 1) * bar * SR))
        if s >= n:
            break
        st = np.arange(e - s) / SR
        env = np.minimum(1, st / 0.35) * np.minimum(1, (bar - st) / 0.25)
        for m in chords[i % 4]:
            f = 440 * 2 ** ((m - 69) / 12)
            for det in (-1, 1):
                ff = f * (1 + det * 0.004)
                pad[s:e] += (np.sin(2 * np.pi * ff * st) + 0.25 * np.sin(4 * np.pi * ff * st)) * env
        root = 440 * 2 ** ((chords[i % 4][0] - 12 - 69) / 12)
        bass[s:e] += np.sin(2 * np.pi * root * st) * env
    since_beat = (t % beat)
    duck = 1 - 0.55 * np.exp(-since_beat * 9)
    music += pad * 0.045 * duck + bass * 0.22 * duck
    fade = np.minimum(1, np.minimum(t / 0.3, (total - t) / 0.8))
    music *= np.clip(fade, 0, 1) * 0.55

    sfx = np.zeros(n)
    # whoosh into every scene
    for i, st in enumerate(scene_starts):
        dur = 0.5
        wl = int(dur * SR)
        x = rng.standard_normal(wl)
        ph = np.linspace(0, 1, wl)
        coeff = 0.02 + 0.5 * np.sin(np.pi * ph) ** 2
        w = one_pole(x, coeff) * np.sin(np.pi * ph) ** 1.5
        add(sfx, w * (0.5 if i else 0.0), (st - 0.28) * SR)
    # impact at the start
    il = int(0.9 * SR)
    it = np.arange(il) / SR
    impact = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-it * 12)) / SR) * np.exp(-it * 4.5)
    add(sfx, impact * 0.9, 0)
    # clicks for taps
    ckl = int(0.05 * SR)
    ct = np.arange(ckl) / SR
    click = (np.sin(2 * np.pi * 2300 * ct) * 0.6 + rng.standard_normal(ckl) * 0.4) * np.exp(-ct * 140)
    for tp in taps:
        add(sfx, click * 0.7, tp * SR)
    mix = music + sfx
    mix /= max(1e-6, np.abs(mix).max()) / 0.89
    return mix


def write_wav(path, mono):
    data = (np.clip(mono, -1, 1) * 32767).astype(np.int16)
    stereo = np.repeat(data[:, None], 2, axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


# ---------------------------------------------------------------- main render

def render(spec, out_path, crf=21, preview=None):
    accent = hex_rgb(spec.get("accent", DEFAULT_ACCENT))
    ctx = {"accent": accent, "url": spec.get("url", DEFAULT_URL)}
    scenes = [SCENES[s["type"]](s, ctx) for s in spec["scenes"]]
    starts, acc = [], 0.0
    for s in scenes:
        starts.append(acc)
        acc += s.duration
    total = acc
    taps = [st + tp for s, st in zip(scenes, starts) for tp in s.taps]
    bg = Background(accent)
    wm_font = font("Inter-SemiBold.otf", 30)

    tmp = tempfile.mkdtemp(prefix="promo-")
    wav = os.path.join(tmp, "audio.wav")
    write_wav(wav, synth_audio(total, starts, taps, seed=abs(hash(spec.get("id", out_path))) % 1000))

    n_frames = int(round(total * FPS))
    if preview is None:
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
               "-i", wav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100",
               "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-profile:v", "high",
               "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out_path]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    prev_last = None
    si = 0
    for fi in range(n_frames):
        gt = fi / FPS
        while si + 1 < len(scenes) and gt >= starts[si + 1]:
            si += 1
        scene, lt = scenes[si], gt - starts[si]
        strength = 1.25 if isinstance(scene, (HookScene, CtaScene)) else 0.9
        canvas = bg.frame(gt, strength)
        scene.render(canvas, lt)
        if not isinstance(scene, (HookScene, CtaScene)):
            wl, wt, wr, wb = wm_font.getbbox(ctx["url"])
            ImageDraw.Draw(canvas).text(((W - (wr - wl)) / 2 - wl, 1835), ctx["url"], font=wm_font, fill=(150, 150, 170, 200))
        frame = canvas.convert("RGB")
        # transition: zoom-in + crossfade from the previous scene
        tr = 0.24
        if si > 0 and lt < tr and prev_last is not None:
            p = ease_out(lt / tr)
            z = 1.08 - 0.08 * p
            cw, ch = int(W / z), int(H / z)
            frame = frame.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
            frame = Image.blend(prev_last, frame, p)
        if si + 1 < len(scenes) and gt + 1 / FPS >= starts[si + 1]:
            prev_last = frame
        d = ImageDraw.Draw(frame)
        d.rectangle([0, 0, W, 11], fill=(40, 38, 52))
        d.rectangle([0, 0, int(W * (fi + 1) / n_frames), 11], fill=accent)
        if preview is not None:
            if fi in preview:
                frame.save(f"{out_path}.{fi:04d}.png")
            continue
        proc.stdin.write(frame.tobytes())
    if preview is None:
        proc.stdin.close()
        if proc.wait() != 0:
            raise SystemExit(f"ffmpeg failed for {out_path}")
    return total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("specs", nargs="+", help="spec JSON files (or one spec and an output path)")
    ap.add_argument("--out-dir", help="write <spec id>.mp4 for every spec into this folder")
    ap.add_argument("--crf", type=int, default=21, help="x264 quality, lower is better (default 21)")
    ap.add_argument("--preview", help="comma separated frame numbers to save as PNG instead of a video")
    args = ap.parse_args()
    paths = []
    for p in args.specs:
        paths.extend(sorted(glob.glob(p)) or [p])
    if not args.out_dir and len(paths) == 2 and paths[1].endswith(".mp4"):
        jobs = [(paths[0], paths[1])]
    else:
        out_dir = args.out_dir or "."
        os.makedirs(out_dir, exist_ok=True)
        jobs = []
        for p in paths:
            with open(p) as fh:
                sid = json.load(fh).get("id") or os.path.splitext(os.path.basename(p))[0]
            jobs.append((p, os.path.join(out_dir, f"{sid}.mp4")))
    preview = {int(x) for x in args.preview.split(",")} if args.preview else None
    for spec_path, out in jobs:
        with open(spec_path) as fh:
            spec = json.load(fh)
        total = render(spec, out, args.crf, preview)
        print(f"{out}  {total:.1f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
