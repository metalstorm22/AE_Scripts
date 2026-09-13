#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_SDK="${AE_SDK_EXAMPLES_ROOT:?Set AE_SDK_EXAMPLES_ROOT to the Adobe SDK Examples directory}"
mkdir -p "$TASK_ROOT/build/native-tests"
xcrun clang++ -std=c++17 "$TASK_ROOT/tests/test_surface.cpp" -o "$TASK_ROOT/build/native-tests/surface"
"$TASK_ROOT/build/native-tests/surface"
xcrun clang++ -std=c++17 -fobjc-arc -O2 -I"$TASK_SDK/Headers" -I"$TASK_SDK/Headers/SP" -I"$TASK_SDK/Util" "$TASK_ROOT/tests/native_data.mm" "$TASK_SDK/Util/AEGP_SuiteHandler.cpp" "$TASK_SDK/Util/AEFX_SuiteHelper.c" "$TASK_SDK/Util/MissingSuiteError.cpp" -framework Cocoa -o "$TASK_ROOT/build/native-tests/data"
"$TASK_ROOT/build/native-tests/data" "${1:-$TASK_ROOT/jobs/challenge-clean/result.json}"
