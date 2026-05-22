#!/usr/bin/env bash
# Boot Wiz6 in DOSBox-X with the interactive debugger enabled.
# The debugger appears as a separate window (or inline) — see DEBUG_GUIDE.md
# for what to do once it's up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOSBOX=/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x
CONF="$ROOT/tools/dosbox/wiz6.conf"
LOG="$ROOT/tools/dosbox/dosbox.log"

rm -f "$LOG"
cd "$ROOT/tools/dosbox"
"$DOSBOX" -conf "$CONF" -debug -log-int21 -log-fileio 2>&1 | tee "$LOG"
