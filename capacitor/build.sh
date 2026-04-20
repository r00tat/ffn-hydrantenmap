#!/usr/bin/env bash
# Build the Android APK for sideloading.
#
# Usage:
#   ./build.sh            # debug build (default)
#   ./build.sh release    # release build (needs signing config in android/app)
#
# The produced APK path is printed at the end.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_TYPE="${1:-debug}"

case "$BUILD_TYPE" in
  debug)
    GRADLE_TASK="assembleDebug"
    APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  release)
    GRADLE_TASK="assembleRelease"
    APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
    ;;
  *)
    echo "Unknown build type: $BUILD_TYPE (use 'debug' or 'release')" >&2
    exit 1
    ;;
esac

echo "==> Syncing Capacitor → Android"
npx cap sync android

echo "==> Running Gradle: $GRADLE_TASK"
cd android
./gradlew "$GRADLE_TASK"
cd "$SCRIPT_DIR"

if [[ -f "$APK_PATH" ]]; then
  echo ""
  echo "APK built: $APK_PATH"
  echo "Sideload: adb install -r \"$APK_PATH\""
else
  echo "Build finished but expected APK not found at: $APK_PATH" >&2
  exit 1
fi
