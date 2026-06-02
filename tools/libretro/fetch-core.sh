#!/usr/bin/env bash
# Download the official dosbox-pure libretro core (Apple Silicon). The .dylib is
# gitignored; this script makes the fetch reproducible. Pin the sha256 you trust.
set -euo pipefail
cd "$(dirname "$0")"
URL="https://buildbot.libretro.com/nightly/apple/osx/arm64/latest/dosbox_pure_libretro.dylib.zip"
curl -fsSL -o core.zip "$URL"
unzip -o core.zip >/dev/null
rm -f core.zip
echo "sha256: $(shasum -a 256 dosbox_pure_libretro.dylib)"
echo "fetched dosbox_pure_libretro.dylib"
