#!/bin/sh
# Build DeskCity and install it in /Applications, and only there: the build's own copy is removed
# afterwards so Spotlight and Launchpad never show two DeskCity apps.
set -e
cd "$(dirname "$0")/.."
npx tauri build --bundles app
BUNDLE=src-tauri/target/release/bundle/macos/DeskCity.app
osascript -e 'quit app "DeskCity"' 2>/dev/null || true
pkill -x deskcity 2>/dev/null || true
rm -rf /Applications/DeskCity.app
ditto "$BUNDLE" /Applications/DeskCity.app
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$BUNDLE" 2>/dev/null || true
rm -rf "$BUNDLE"
touch src-tauri/target/.metadata_never_index # keep Spotlight out of build output
open /Applications/DeskCity.app
