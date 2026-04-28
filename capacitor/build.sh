#!/usr/bin/env bash
# Build the Android APK or AAB.
#
# Usage:
#   ./build.sh            # debug APK (default, for sideloading)
#   ./build.sh release    # release APK (needs signing config in android/app)
#   ./build.sh bundle     # release AAB for Google Play (needs signing config)
#
# The produced artifact path is printed at the end.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_TYPE="${1:-debug}"

case "$BUILD_TYPE" in
  debug)
    GRADLE_TASK="assembleDebug"
    ARTIFACT_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
    ARTIFACT_LABEL="APK"
    ;;
  release)
    GRADLE_TASK="assembleRelease"
    ARTIFACT_PATH="android/app/build/outputs/apk/release/app-release.apk"
    ARTIFACT_LABEL="APK"
    ;;
  bundle)
    GRADLE_TASK="bundleRelease"
    ARTIFACT_PATH="android/app/build/outputs/bundle/release/app-release.aab"
    ARTIFACT_LABEL="AAB"
    ;;
  *)
    echo "Unknown build type: $BUILD_TYPE (use 'debug', 'release', or 'bundle')" >&2
    exit 1
    ;;
esac

echo "==> Syncing Capacitor → Android"
npx cap sync android

echo "==> Running Gradle: $GRADLE_TASK"
cd android
./gradlew "$GRADLE_TASK"
cd "$SCRIPT_DIR"

if [[ -f "$ARTIFACT_PATH" ]]; then
  echo ""
  echo "$ARTIFACT_LABEL built: $ARTIFACT_PATH"
  if [[ "$ARTIFACT_LABEL" == "APK" ]]; then
    echo "Sideload: adb install -r \"$ARTIFACT_PATH\""
  else
    echo "Upload to Google Play Console: https://play.google.com/console"
  fi
else
  echo "Build finished but expected $ARTIFACT_LABEL not found at: $ARTIFACT_PATH" >&2
  exit 1
fi
