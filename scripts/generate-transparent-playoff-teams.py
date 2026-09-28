import os
import sys
import shutil
from pathlib import Path
from rembg import remove
from PIL import Image, ImageOps

project_dir = Path(__file__).resolve().parents[1]
source_dir = project_dir / "PLAYOFFS/TEAM PHOTOS"
target_dir = project_dir / "PLAYOFFS/TRANSPARENT 8 TEAMS PLAYOFFS"
target_logos_dir = target_dir / "LOGOS"

target_dir.mkdir(parents=True, exist_ok=True)
target_logos_dir.mkdir(parents=True, exist_ok=True)

# 1. Process 8 Team Photos
team_files = [
    "APO.png",
    "EARTH SAVERS.png",
    "FSMS.png",
    "JMES.png",
    "PICE.png",
    "PSITS.png",
    "UFTTS.png",
    "ULS-CED.png"
]

print(f"Generating transparent cutouts for {len(team_files)} team photos...")

for i, fname in enumerate(team_files, 1):
    src = source_dir / fname
    dst = target_dir / fname
    if dst.exists():
        print(f"[{i}/{len(team_files)}] Already exists: {fname}")
        continue
    print(f"[{i}/{len(team_files)}] Processing {fname}...")
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGBA")
            im.thumbnail((2000, 2000))
            out = remove(im)
            alpha = out.getchannel("A")
            bounds = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
            if bounds:
                pad = round(max(out.size) * 0.015)
                x0, y0, x1, y1 = bounds
                out = out.crop((max(0, x0 - pad), max(0, y0 - pad), min(out.width, x1 + pad), min(out.height, y1 + pad)))
            temp_path = str(dst) + ".tmp"
            out.save(temp_path, "PNG", optimize=True)
            os.replace(temp_path, str(dst))
            print(f" -> Saved transparent team photo: {dst.name}")
    except Exception as e:
        print(f" -> Error on {fname}: {e}")

# 2. Copy 8 Transparent Team Logos
logo_map = {
    "APO.png": "public/assets/logos-transparent/APO.jpg.png",
    "EARTH SAVERS.png": "public/assets/match-team-logos/transparent-usm-earth-savers-club.png",
    "FSMS.png": "public/assets/logos-transparent/FSMS.png.png",
    "JMES.png": "public/assets/match-team-logos/transparent-jmes.png",
    "PICE.png": "public/assets/logos-transparent/PICE-USM SC.png.png",
    "PSITS.png": "public/assets/logos-transparent/PSITS.png.png",
    "UFTTS.png": "public/assets/logos-transparent/UFTTS(Turismo).jpg.png",
    "ULS-CED.png": "public/assets/logos-transparent/ULS.jpg.png",
}

print("\nCopying transparent team logos into LOGOS subfolder...")
for out_name, src_rel in logo_map.items():
    src_file = project_dir / src_rel
    dst_file = target_logos_dir / out_name
    if src_file.exists():
        shutil.copyfile(src_file, dst_file)
        print(f" -> Copied logo: {out_name}")
    else:
        print(f" -> Warning: logo not found {src_rel}")

print("\nAll transparent 8 teams assets successfully generated!")
