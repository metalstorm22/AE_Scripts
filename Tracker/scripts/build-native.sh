#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_SDK="${AE_SDK_EXAMPLES_ROOT:?Set AE_SDK_EXAMPLES_ROOT to the Adobe SDK Examples directory}"
TASK_BUNDLE="${SCENETRACK_NATIVE_OUTPUT:-$TASK_ROOT/build/native/SceneTrack.plugin}"
mkdir -p "$TASK_BUNDLE/Contents/MacOS" "$TASK_BUNDLE/Contents/Resources"
TASK_INC=(-I"$TASK_SDK/Headers" -I"$TASK_SDK/Headers/SP" -I"$TASK_SDK/Util")
xcrun clang++ -std=c++17 -fobjc-arc -bundle -arch arm64 -arch x86_64 -mmacosx-version-min=12.0 -O2 "-DSCENETRACK_ROOT=\"$TASK_ROOT\"" "${TASK_INC[@]}" "$TASK_ROOT/native/effect/SceneTrack.mm" "$TASK_SDK/Util/AEGP_SuiteHandler.cpp" "$TASK_SDK/Util/AEFX_SuiteHelper.c" "$TASK_SDK/Util/MissingSuiteError.cpp" -framework Cocoa -o "$TASK_BUNDLE/Contents/MacOS/SceneTrack"
rm -f "$TASK_BUNDLE/Contents/Resources/SceneTrack.rsrc"
xcrun Rez -useDF -d __MACH__ -i "$TASK_SDK/Headers" -i "$TASK_SDK/Resources" "$TASK_ROOT/native/effect/SceneTrackPiPL.r" -o "$TASK_BUNDLE/Contents/Resources/SceneTrack.rsrc"
cat > "$TASK_BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.scenetrack.effect</string><key>CFBundleName</key><string>SceneTrack</string><key>CFBundleExecutable</key><string>SceneTrack</string><key>CFBundleInfoDictionaryVersion</key><string>6.0</string><key>CFBundleSignature</key><string>FXTC</string><key>CFBundlePackageType</key><string>eFKT</string><key>CFBundleVersion</key><string>0.2.0</string></dict></plist>
PLIST
codesign --force --sign - "$TASK_BUNDLE"
lipo -archs "$TASK_BUNDLE/Contents/MacOS/SceneTrack"
echo "$TASK_BUNDLE"
