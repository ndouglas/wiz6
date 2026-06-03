#!/usr/bin/env bash
# Build the control harness (host). The dosbox-pure CORE it loads
# (dosbox_pure_libretro.dylib) is built separately:
#   - build-core.sh  → the PATCHED, TRACEABLE core (instruction-trace hook;
#                       exports dbp_trace_* / dbp_regs). Use this for tracing.
#   - fetch-core.sh  → an unpatched prebuilt nightly fallback (no tracing).
# The host dlsyms the trace exports lazily, so it works against either core
# (the trace/regs/tracelog commands report "err notrace" on an unpatched core).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p /tmp/wiz6-libretro
cc -O2 -o host host.c
codesign --entitlements entitlements.plist -f -s - host
echo "built + signed host"
