#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_DEST="${1:?Pass the AE Plug-ins directory for the version to test}"
TASK_SOURCE="$TASK_ROOT/build/native/SceneTrack.plugin"
[[ -d "$TASK_DEST" && -d "$TASK_SOURCE" ]] || { echo 'Build the plugin and choose an existing AE Plug-ins directory.' >&2; exit 1; }
[[ ! -e "$TASK_DEST/SceneTrack.plugin" ]] || { echo 'SceneTrack already exists here; refusing to overwrite it.' >&2; exit 1; }
codesign --verify --strict "$TASK_SOURCE"
ditto "$TASK_SOURCE" "$TASK_DEST/SceneTrack.plugin"
echo 'SceneTrack installed. Save your work and restart that AE version before testing.'
