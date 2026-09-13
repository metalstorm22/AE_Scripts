#!/bin/bash
set -euo pipefail
SCENETRACK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCENETRACK_ROOT"
"${SCENETRACK_PYTHON:-python3.12}" -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
mkdir -p build jobs
xcrun swiftc -O native/Masker.swift -o build/masker -module-cache-path "${TMPDIR:-/tmp}/scenetrack-swift-cache"
echo 'Base tracker installed. Run scripts/setup_sam.sh for Meta SAM segmentation.'
