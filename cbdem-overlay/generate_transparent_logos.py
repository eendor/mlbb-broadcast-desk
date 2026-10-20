#!/usr/bin/env python3
"""
Rebuild the transparent team logos used by the overlay and the control panel.

    python3 generate_transparent_logos.py

Reads public/assets/logos/ and writes 512x512 PNGs to public/assets/logos-transparent/.

How each logo is cut:
  edge    remove only the background that touches the image border, so white
          artwork inside a seal (JPSPA lettering, JPIA centre) stays white
  circle  fit a smooth circular mask to a round badge (JMES, JPAMS)
  global  remove every near-white pixel, holes included (JPES mark)

Edge pixels get partial transparency with the background colour taken out of
them, so the logos stay clean on dark glass instead of showing a white halo.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'public' / 'assets' / 'logos'
OUT = ROOT / 'public' / 'assets' / 'logos-transparent'

SIZE = 512      # output canvas in px
MARGIN = 0.03   # empty border around the artwork, as a share of the canvas
WORK = 1024     # longest side used while cutting

WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

LOGOS = [
    # id,     file,        background, method,   options
    ('JPES',  'JPES.png',  WHITE, 'global', {'crop': (200, 114, 650, 607), 'specks': 12}),  # mark only; keep the small road dashes
    ('JMES',  'JMES.jpg',  WHITE, 'circle', {'thresh': 60}),
    ('JPSPA', 'JPSPA.png', WHITE, 'edge',   {'trim_bottom': 3}),  # source has a stray black line at the bottom
    ('JPIA',  'JPIA.jpg',  WHITE, 'edge',   {'trim_top': 1}),     # source has a stray grey line at the top
    ('JPAMS', 'JPAMS.jpg', BLACK, 'circle', {'thresh': 25}),
]


def load(name, bg, crop=None, trim_top=0, trim_bottom=0):
    img = Image.open(SRC / name).convert('RGB')
    if crop:
        img = img.crop(crop)
    if trim_top or trim_bottom:
        # paint the stray lines with the background colour so they are cut away too
        fill = Image.new('RGB', (img.width, 1), bg)
        for y in list(range(trim_top)) + list(range(img.height - trim_bottom, img.height)):
            img.paste(fill, (0, y))
    scale = WORK / max(img.size)
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    return np.asarray(img).astype(np.float32)


def distance(rgb, bg):
    """Largest per-channel difference from the background colour (0-255)."""
    return np.abs(rgb - np.array(bg, np.float32)).max(axis=2)


def shifted_max(a, r):
    """Maximum over a (2r+1) square window around each pixel."""
    padded = np.pad(a, r, mode='edge')
    h, w = a.shape
    out = a.copy()
    for dy in range(2 * r + 1):
        for dx in range(2 * r + 1):
            np.maximum(out, padded[dy:dy + h, dx:dx + w], out=out)
    return out


def dilate(mask, r):
    return shifted_max(mask.astype(np.uint8), r).astype(bool)


def spread_rows(mask, reached):
    """Within each row, mark every run of mask pixels that already holds a reached pixel."""
    left = np.zeros_like(mask)
    left[:, 1:] = mask[:, :-1]
    starts = (mask & ~left).ravel()
    run_id = np.cumsum(starts) - 1
    flat_mask = mask.ravel()
    hit = np.zeros(int(starts.sum()), bool)
    hit[run_id[reached.ravel() & flat_mask]] = True
    out = np.zeros(flat_mask.shape, bool)
    out[flat_mask] = hit[run_id[flat_mask]]
    return out.reshape(mask.shape)


def flood(mask, seeds):
    """Pixels of `mask` connected to any seed pixel (4-neighbour flood fill)."""
    reached = mask & seeds
    count = -1
    while reached.sum() != count:
        count = reached.sum()
        reached = spread_rows(mask, reached)
        reached = spread_rows(mask.T, reached.T).T
    return reached


def edge_connected(mask):
    """Pixels of `mask` connected to the image border."""
    border = np.zeros_like(mask)
    border[[0, -1], :] = True
    border[:, [0, -1]] = True
    return flood(mask, border)


def small_pieces(mask):
    """Yield the pixel lists of the separate pieces of `mask` (8-neighbour)."""
    left = set(zip(*np.nonzero(mask)))
    while left:
        stack = [left.pop()]
        piece = []
        while stack:
            y, x = stack.pop()
            piece.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    n = (y + dy, x + dx)
                    if n in left:
                        left.remove(n)
                        stack.append(n)
        yield piece


def remove_specks(alpha, min_output_px=40):
    """Drop stray dots left over from the background (anything under ~40 px in the final 512 px logo)."""
    solid = alpha > 0.5
    core = flood(solid, ~dilate(~solid, 4))  # pieces with a thick part are always kept
    ys, xs = np.nonzero(core)
    scale = SIZE * (1 - 2 * MARGIN) / max(np.ptp(xs) + 1, np.ptp(ys) + 1)
    min_px = min_output_px / scale ** 2
    keep = core.copy()
    for piece in small_pieces(solid & ~core):
        if len(piece) >= min_px:
            keep[tuple(zip(*piece))] = True
    return np.where(dilate(keep, 2), alpha, 0)


def soft_alpha(rgb, bg, background, lo=14):
    """Alpha that is 0 on the background, 1 on the artwork and partial on mixed edge pixels."""
    d = distance(rgb, bg)
    local = shifted_max(d, 3)  # how far the nearby artwork colour sits from the background
    ramp = np.clip((d - lo) / np.maximum(local - lo, 1), 0, 1)
    alpha = np.ones(d.shape, np.float32)
    band = dilate(background, 3)
    alpha[band] = ramp[band]
    return alpha


def circle_alpha(rgb, bg, thresh, inset=1.5):
    d = distance(rgb, bg)
    ys, xs = np.nonzero(d > thresh)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    radius = min(x1 - x0, y1 - y0) / 2 - inset
    yy, xx = np.mgrid[0:d.shape[0], 0:d.shape[1]]
    dist = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    return np.clip(radius - dist + 0.5, 0, 1).astype(np.float32)


def unmix(rgb, alpha, bg):
    """Remove the background colour from partly transparent edge pixels."""
    a = alpha[..., None]
    bg = np.array(bg, np.float32)
    out = (rgb - bg * (1 - a)) / np.maximum(a, 1e-3)
    return np.where(a > 0, np.clip(out, 0, 255), 0)


def finish(rgb, alpha, team_id):
    rgba = np.dstack([rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    bbox = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(bbox)
    side = round(max(img.size) / (1 - 2 * MARGIN))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    # resize with premultiplied alpha so edges do not pick up dark or white fringes
    canvas = canvas.convert('RGBa').resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
    path = OUT / f'{team_id}.png'
    canvas.save(path, optimize=True)
    return path, img.size


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for team_id, filename, bg, method, opts in LOGOS:
        load_opts = {k: opts[k] for k in ('crop', 'trim_top', 'trim_bottom') if k in opts}
        rgb = load(filename, bg, **load_opts)
        if method == 'circle':
            alpha = circle_alpha(rgb, bg, opts['thresh'])
        elif method == 'edge':
            alpha = soft_alpha(rgb, bg, edge_connected(distance(rgb, bg) < 60))
        else:
            alpha = soft_alpha(rgb, bg, distance(rgb, bg) < 60)
        alpha = remove_specks(alpha, opts.get('specks', 40))
        path, size = finish(unmix(rgb, alpha, bg), alpha, team_id)
        print(f'{team_id:6} {method:6} artwork {size[0]}x{size[1]} -> {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
