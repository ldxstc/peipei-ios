#!/bin/bash
# Sync app icons from web app brand source — ensures correct logo in every build
set -e

BRAND_ICON="/Users/ldxstc/personal/peipei/public/brand/icon-1024.png"
ICON_DIR="$(dirname "$0")/../PeiPei/Resources/Assets.xcassets/AppIcon.appiconset"

if [ ! -f "$BRAND_ICON" ]; then
    echo "⚠️ Brand icon not found at $BRAND_ICON — skipping icon sync"
    exit 0
fi

python3 -c "
from PIL import Image
import os, sys

src = '$BRAND_ICON'
dst = '$ICON_DIR'

img = Image.open(src).convert('RGBA')
bg = Image.new('RGB', img.size, (0, 0, 0))
bg.paste(img, mask=img.split()[3])

sizes = {
    'Icon-1024.png': 1024,
    'Icon-20@2x.png': 40, 'Icon-20@3x.png': 60,
    'Icon-29@2x.png': 58, 'Icon-29@3x.png': 87,
    'Icon-40@2x.png': 80, 'Icon-40@3x.png': 120,
    'Icon-60@2x.png': 120, 'Icon-60@3x.png': 180,
    'Icon-76@2x.png': 152, 'Icon-83.5@2x.png': 167,
}

for name, size in sizes.items():
    bg.resize((size, size), Image.LANCZOS).save(os.path.join(dst, name), 'PNG')

print('✅ App icons synced from brand source')
"
