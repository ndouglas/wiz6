#!/usr/bin/env bash
# Boot Wiz6 in DOSBox-X with INT 21h file-open logging.
# Output goes to tools/dosbox/dosbox.log next to this script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOSBOX=/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x
CONF="$ROOT/tools/dosbox/wiz6.conf"
LOG="$ROOT/tools/dosbox/dosbox.log"

rm -f "$LOG"
cd "$ROOT/tools/dosbox"
"$DOSBOX" -conf "$CONF" -log-int21 -log-fileio -nogui 2>&1 | tee "$LOG"
