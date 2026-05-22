#!/usr/bin/env bash
# Create a Ghidra project at tools/ghidra/wiz6 and import + auto-analyze all
# Wizardry VI binaries. Idempotent: re-runs only re-analyze missing imports.
#
# Usage: tools/ghidra/setup.sh [--force]
#   --force  delete the existing project before importing
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GHIDRA_HEADLESS=/opt/homebrew/Cellar/ghidra/12.1/libexec/support/analyzeHeadless
PROJECT_DIR="$ROOT/tools/ghidra"
PROJECT_NAME=wiz6
ORIGINAL="$ROOT/original"

if [[ "${1:-}" == "--force" ]] && [ -d "$PROJECT_DIR/$PROJECT_NAME.rep" ]; then
    echo "removing existing project..."
    rm -rf "$PROJECT_DIR/$PROJECT_NAME.rep" "$PROJECT_DIR/$PROJECT_NAME.gpr" "$PROJECT_DIR/$PROJECT_NAME.lock"*
fi

# The interesting binaries to analyze. Sound files, screen files, fonts,
# scenario/msg DBs etc. aren't code so we skip them.
BINARIES=(
    wroot.exe
    winstall.exe
    ega.drv
    cga.drv
    herc.drv
    tandy.drv
    wbase.ovr
    wdopt.ovr
    winit.ovr
    wmaze.ovr
    wmele.ovr
    wmexe.ovr
    wmnpc.ovr
    wpcmk.ovr
    wpcvw.ovr
    wpops.ovr
    wtrea.ovr
)

# Import + analyze each. .exe files use MzLoader (they have an MZ header);
# .drv and .ovr files are raw 16-bit x86 code with no header — use BinaryLoader
# with explicit Real Mode processor spec.
for bin in "${BINARIES[@]}"; do
    path="$ORIGINAL/$bin"
    if [ ! -f "$path" ]; then
        echo "skip missing $bin"
        continue
    fi
    echo "=== $bin ==="
    case "$bin" in
        *.exe)
            "$GHIDRA_HEADLESS" "$PROJECT_DIR" "$PROJECT_NAME" \
                -import "$path" \
                -overwrite \
                -loader MzLoader \
                -analysisTimeoutPerFile 600 \
                2>&1 | grep -E "(Analysis succeeded|Import succeeded|ERROR)" | tail -4
            ;;
        *.drv | *.ovr)
            "$GHIDRA_HEADLESS" "$PROJECT_DIR" "$PROJECT_NAME" \
                -import "$path" \
                -overwrite \
                -loader BinaryLoader \
                -processor "x86:LE:16:Real Mode" \
                -analysisTimeoutPerFile 600 \
                2>&1 | grep -E "(Analysis succeeded|Import succeeded|ERROR)" | tail -4
            ;;
    esac
done

echo ""
echo "Done. Open the project with:"
echo "  ghidraRun \"$PROJECT_DIR/$PROJECT_NAME.gpr\""
