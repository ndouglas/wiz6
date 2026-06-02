#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p /tmp/wiz6-libretro
cc -O2 -o host host.c
codesign --entitlements entitlements.plist -f -s - host
echo "built + signed host"
