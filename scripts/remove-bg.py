#!/usr/bin/env python
"""Remove the background from an MVP player photo using rembg (u2net).
Usage: python remove-bg.py <input> <output.png>
Outputs a transparent PNG. Exits non-zero on failure so the server can fall
back to the original image."""
import sys
import os
from rembg import remove
from PIL import Image, ImageOps

def main():
    if len(sys.argv) != 3:
        print("usage: remove-bg.py <input> <output.png>", file=sys.stderr)
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGBA")
        im.thumbnail((2000, 2000))
        out = remove(im)  # returns RGBA with alpha cutout
        alpha=out.getchannel('A')
        bounds=alpha.point(lambda v:255 if v>20 else 0).getbbox()
        if not bounds or alpha.getextrema()[0]>240:
            raise RuntimeError('A transparent foreground could not be detected')
        pad=round(max(out.size)*.015)
        x0,y0,x1,y1=bounds
        out=out.crop((max(0,x0-pad),max(0,y0-pad),min(out.width,x1+pad),min(out.height,y1+pad)))
        temporary=dst+'.tmp'
        out.save(temporary, "PNG", optimize=True)
        os.replace(temporary,dst)
    return 0

if __name__ == "__main__":
    sys.exit(main())
