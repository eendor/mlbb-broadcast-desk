#!/usr/bin/env python3
"""
Generate transparent logos for CBDEM MLBB tournament overlay.
Chroma-key backgrounds and output transparent PNGs.
"""

from PIL import Image
import os

# Paths
LOGOS_DIR = 'public/assets/logos'
OUTPUT_DIR = 'public/assets/logos-transparent'

def remove_white_background(img):
    """Remove white/near-white backgrounds"""
    img = img.convert("RGBA")
    data = img.getdata()

    new_data = []
    for item in data:
        # If pixel is mostly white (all RGB channels > 220), make it transparent
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    return img

def remove_black_background_preserve_green(img):
    """Remove black background but preserve dark green colors (for JPAMS)"""
    img = img.convert("RGBA")
    data = img.getdata()

    new_data = []
    for item in data:
        r, g, b = item[0], item[1], item[2]
        # Only remove pure black or near-black with low green channel
        # Preserve dark green (green channel significantly higher than red/blue)
        if r < 30 and b < 30 and g < 35 and not (g > r + 5):
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    return img

def crop_to_content(img):
    """Crop image to content bounding box"""
    # Get bounding box of non-transparent pixels
    bbox = img.getbbox()
    if bbox:
        return img.crop(bbox)
    return img

def process_logo(filename, team_id, remove_bg_func):
    """Process a single logo file"""
    input_path = os.path.join(LOGOS_DIR, filename)
    output_path = os.path.join(OUTPUT_DIR, f"{team_id}.png")

    print(f"Processing {team_id} ({filename})...")

    try:
        img = Image.open(input_path)

        # Apply background removal
        img = remove_bg_func(img)

        # Crop to content
        img = crop_to_content(img)

        # Save as PNG
        img.save(output_path, "PNG")
        print(f"  ✓ Saved to {output_path}")

        # Also create PNG copy in logos/ if source was JPG
        if filename.lower().endswith('.jpg'):
            png_copy_path = os.path.join(LOGOS_DIR, f"{team_id}.png")
            img_original = Image.open(input_path)
            img_original.save(png_copy_path, "PNG")
            print(f"  ✓ Created PNG copy at {png_copy_path}")

    except Exception as e:
        print(f"  ✗ Error processing {team_id}: {e}")

def main():
    # Create output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Generating transparent logos...\n")

    # White background removal (JPES, JPSPA, JMES, JPIA)
    process_logo('JPES.png', 'JPES', remove_white_background)
    process_logo('JPSPA.png', 'JPSPA', remove_white_background)
    process_logo('JMES.jpg', 'JMES', remove_white_background)
    process_logo('JPIA.jpg', 'JPIA', remove_white_background)

    # Black background removal with green preservation (JPAMS)
    process_logo('JPAMS.jpg', 'JPAMS', remove_black_background_preserve_green)

    print("\n✓ All logos processed successfully!")

if __name__ == '__main__':
    main()
