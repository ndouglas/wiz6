#!/usr/bin/env bash
# Extract MON*.PIC open events from the DOSBox-X log, in order.
# Run this after each encounter so you can match filenames to the monster you saw.
set -euo pipefail

LOG="$(cd "$(dirname "$0")" && pwd)/dosbox.log"
[ -f "$LOG" ] || { echo "no log at $LOG"; exit 1; }

awk '
  /FILES:file open command/ && /\.PIC/ && tolower($0) ~ /mon[0-9]/ {
    # Line looks like:  10963993       FILES:file open command 0 file MON17.PIC
    n = split($0, a, " ")
    ticks = a[1]
    file = a[n]
    printf "tick %s  ->  %s\n", ticks, file
  }
' "$LOG"
