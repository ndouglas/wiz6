#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
swift build -c release
mkdir -p ../bin
cp .build/release/wiz6-input-helper ../bin/wiz6-input-helper
echo "Built and installed: packages/mcp/bin/wiz6-input-helper"
