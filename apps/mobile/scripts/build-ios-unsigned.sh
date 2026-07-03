#!/usr/bin/env bash
# ── Flowtiq Mobile — iOS Unsigned Build ──────────────────────────────────────
# Produces:  apps/mobile/ios/build/FlowtiqMobile-unsigned.ipa
# Usage:     bash apps/mobile/scripts/build-ios-unsigned.sh
#
# Prerequisites (one-time setup — see "SETUP" section below if any step fails):
#   1. Xcode installed from the Mac App Store (not just Command Line Tools)
#   2. xcode-select pointing at Xcode.app
#   3. CocoaPods installed
#   4. ios/FlowtiqMobile.xcodeproj present (generate once — see below)
#   5. pod install done (generates ios/FlowtiqMobile.xcworkspace)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"
IOS_DIR="$MOBILE_DIR/ios"

# ── 1. Verify Xcode is selected ──────────────────────────────────────────────
XCODE_PATH=$(xcode-select -p 2>/dev/null || true)
if [[ "$XCODE_PATH" != *"Xcode"* ]]; then
  echo ""
  echo "ERROR: Xcode is not selected as the active developer directory."
  echo "       Run:  sudo xcode-select --switch /Applications/Xcode.app"
  echo "       Then: sudo xcodebuild -license accept"
  echo ""
  exit 1
fi

# ── 2. Verify FlowtiqMobile.xcodeproj exists ─────────────────────────────────
if [[ ! -d "$IOS_DIR/FlowtiqMobile.xcodeproj" ]]; then
  echo ""
  echo "ERROR: FlowtiqMobile.xcodeproj is missing."
  echo ""
  echo "Generate it once with:"
  echo ""
  echo "  cd $MOBILE_DIR"
  echo "  npx react-native init FlowtiqMobileTmp --version 0.73.6 --skip-install --directory _tmp_init"
  echo "  cp -r _tmp_init/ios/FlowtiqMobile.xcodeproj  ios/"
  echo "  cp -r _tmp_init/ios/FlowtiqMobileTests        ios/"
  echo "  rm -rf _tmp_init"
  echo ""
  echo "Then open ios/FlowtiqMobile.xcodeproj in Xcode and:"
  echo "  • Set Bundle Identifier to com.flowtiq.mobile"
  echo "  • Set Deployment Target to iOS 15.0"
  echo "  • Set Development Team (can leave blank for unsigned builds)"
  echo "  • Add the flowtiq_sound.mp3 resource to the target"
  echo ""
  echo "Commit ios/FlowtiqMobile.xcodeproj to git afterwards."
  echo ""
  exit 1
fi

# ── 3. Install CocoaPods if missing ──────────────────────────────────────────
if ! command -v pod &>/dev/null; then
  echo "CocoaPods not found — installing via gem..."
  sudo gem install cocoapods
fi

# ── 4. Run pod install if workspace is missing or Podfile.lock changed ────────
WORKSPACE="$IOS_DIR/FlowtiqMobile.xcworkspace"
if [[ ! -d "$WORKSPACE" ]]; then
  echo "Running pod install..."
  cd "$IOS_DIR"
  pod install
  cd "$REPO_ROOT"
fi

# ── 5. Install JS dependencies ───────────────────────────────────────────────
echo "Installing JS dependencies..."
cd "$REPO_ROOT"
pnpm install --frozen-lockfile

# ── 6. Install Bundler gems (fastlane) ───────────────────────────────────────
echo "Installing Ruby gems..."
cd "$IOS_DIR"
bundle install --quiet

# ── 7. Run fastlane build_unsigned ───────────────────────────────────────────
echo ""
echo "Building unsigned IPA..."
bundle exec fastlane build_unsigned

echo ""
echo "Done. IPA is at:"
echo "  $IOS_DIR/build/FlowtiqMobile-unsigned.ipa"
