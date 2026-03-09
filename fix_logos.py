#!/usr/bin/env python3
"""Fix logos: make transparent backgrounds, create dark mode variants."""

from PIL import Image
import os
import numpy as np

BASE = "/Users/sadanakb/rechnungswerk/frontend/public"


def make_transparent(img):
    """Convert white/near-white pixels to transparent."""
    img = img.convert("RGBA")
    data = np.array(img)
    # White/near-white: R>240, G>240, B>240
    mask = (data[:, :, 0] > 240) & (data[:, :, 1] > 240) & (data[:, :, 2] > 240)
    data[mask, 3] = 0
    return Image.fromarray(data)


def create_dark_variant(img):
    """Create dark mode variant from already-transparent image."""
    img = img.convert("RGBA")
    data = np.array(img).copy()
    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

    # Only process visible pixels (alpha > 0)
    visible = a > 0

    # Dark pixels (R<80 AND G<80 AND B<80) -> white, keep alpha
    dark = visible & (r < 80) & (g < 80) & (b < 80)
    data[dark, 0] = 255
    data[dark, 1] = 255
    data[dark, 2] = 255

    # Green pixels (G>150 AND G>R AND G>B) -> keep unchanged
    # All other pixels -> keep unchanged
    # (no action needed for these cases)

    return Image.fromarray(data)


# Step 1: Main logos - make transparent
print("=== Step 1: Making logos transparent ===")

# logo-horizontal.jpg -> logo-horizontal.png
path = os.path.join(BASE, "logo-horizontal.jpg")
img = Image.open(path)
img_t = make_transparent(img)
out = os.path.join(BASE, "logo-horizontal.png")
img_t.save(out, "PNG")
print(f"  Saved: {out}")

# logo-icon.png
for name in ["logo-icon.png", "logo-stacked.png"]:
    path = os.path.join(BASE, name)
    img = Image.open(path)
    img_t = make_transparent(img)
    img_t.save(path, "PNG")
    print(f"  Saved: {path}")

# Step 2: PWA icons
print("\n=== Step 2: Making PWA icons transparent ===")
pwa_icons = [
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icon-192.png",
    "icon-512.png",
    "apple-touch-icon.png",
    "favicon.ico",
]

for name in pwa_icons:
    path = os.path.join(BASE, name)
    if not os.path.exists(path):
        print(f"  Skipped (not found): {path}")
        continue
    try:
        img = Image.open(path)
        img_t = make_transparent(img)
        if name == "favicon.ico":
            # Save as ICO - resize to standard favicon sizes
            sizes = []
            for s in [16, 32, 48]:
                resized = img_t.resize((s, s), Image.LANCZOS)
                sizes.append(resized)
            sizes[0].save(path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=sizes[1:])
        else:
            img_t.save(path, "PNG")
        print(f"  Saved: {path}")
    except Exception as e:
        print(f"  Skipped ({e}): {path}")

# Step 3: Dark mode variants
print("\n=== Step 3: Creating dark mode variants ===")
dark_pairs = [
    ("logo-horizontal.png", "logo-horizontal-dark.png"),
    ("logo-icon.png", "logo-icon-dark.png"),
    ("logo-stacked.png", "logo-stacked-dark.png"),
]

for src, dst in dark_pairs:
    path = os.path.join(BASE, src)
    img = Image.open(path)
    img_dark = create_dark_variant(img)
    out = os.path.join(BASE, dst)
    img_dark.save(out, "PNG")
    print(f"  Saved: {out}")

print("\nDone!")
