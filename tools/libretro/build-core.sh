#!/usr/bin/env bash
# Build the PATCHED dosbox-pure libretro core with the wiz6 instruction-tracing
# hook (a non-pausing logging breakpoint in the normal CPU core). The result is
# the traceable `dosbox_pure_libretro.dylib` the host harness loads.
#
# Flow:
#   1. Clone the pinned commit into dosbox-pure-src/ if absent (gitignored).
#   2. Reset to the pinned commit + apply dosbox-pure-trace.patch.
#   3. make platform=osx -j4
#   4. Copy the .dylib next to host.c and codesign it.
#
# fetch-core.sh remains the UNPATCHED fallback (a prebuilt nightly, no tracing).
set -euo pipefail
cd "$(dirname "$0")"

REPO="https://github.com/libretro/dosbox-pure.git"
PIN="42485508b705e215d161eb581dec1984551fa9c2"
SRC="dosbox-pure-src"
PATCH="dosbox-pure-trace.patch"

if [ ! -d "$SRC/.git" ]; then
  echo "cloning dosbox-pure @ $PIN ..."
  git clone "$REPO" "$SRC"
fi

git -C "$SRC" fetch --quiet origin "$PIN" 2>/dev/null || true
git -C "$SRC" checkout --quiet "$PIN"
# Drop any prior patch application so this is reproducible (hard reset the tree
# to the pinned commit; the patch touches src/cpu/core_normal.cpp + src/hardware/mixer.cpp).
git -C "$SRC" reset --hard --quiet "$PIN"

echo "applying $PATCH ..."
git -C "$SRC" apply "../$PATCH"

echo "building (make platform=osx -j4) ..."
make -C "$SRC" platform=osx -j4

cp "$SRC/dosbox_pure_libretro.dylib" dosbox_pure_libretro.dylib
codesign --entitlements entitlements.plist -f -s - dosbox_pure_libretro.dylib

echo "verifying trace exports ..."
if ! nm -gU dosbox_pure_libretro.dylib | grep -q _dbp_trace_set; then
  echo "ERROR: dbp_trace_* symbols missing from the built core" >&2
  exit 1
fi
nm -gU dosbox_pure_libretro.dylib | grep _dbp_ || true
echo "built + signed traceable dosbox_pure_libretro.dylib"
