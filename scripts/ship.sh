#!/bin/bash
# Build, archive, upload to TestFlight, and auto-distribute to testers
# Requires: setup-asc-key.sh to have been run first
set -e

cd "$(dirname "$0")/.."

# Load ASC credentials
if [ -f ~/.appstoreconnect/peipei.env ]; then
    source ~/.appstoreconnect/peipei.env
export ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
else
    echo "❌ No ASC API key configured. Run ./scripts/setup-asc-key.sh first."
    exit 1
fi

# Expand ~ in key path
ASC_KEY_PATH="${ASC_KEY_PATH/#\~/$HOME}"

# Sync app icons from brand source
"$(dirname "$0")/sync-icons.sh"

# Run UI tests before shipping
echo "🧪 Running UI tests..."
xcodebuild test -scheme PeiPei -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17 Pro" -only-testing:PeiPeiUITests -quiet 2>&1 | tail -5
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "❌ UI tests failed — aborting ship."
    exit 1
fi
echo "✅ All UI tests passed"

echo "🏗️  Building PeiPei..."

# Auto-increment version (patch bump) and build number
CURRENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" PeiPei/Info.plist)
CURRENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" PeiPei/Info.plist)

# Bump patch version: 3.0.0 → 3.0.1, 3.0.1 → 3.0.2, etc.
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
NEW_BUILD=$((CURRENT_BUILD + 1))

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" PeiPei/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" PeiPei/Info.plist

# Also update project.yml so xcodegen stays in sync
sed -i '' "s/MARKETING_VERSION: \".*\"/MARKETING_VERSION: \"$VERSION\"/" project.yml
sed -i '' "s/CFBundleShortVersionString: \".*\"/CFBundleShortVersionString: \"$VERSION\"/" project.yml

echo "   Version: ${VERSION} (${NEW_BUILD})"

# Archive
echo "📦 Archiving..."
xcodebuild clean archive \
    -scheme PeiPei \
    -archivePath /tmp/PeiPei-ship.xcarchive \
    -sdk iphoneos \
    -configuration Release \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM=MNB3V4MHFJ \
    CODE_SIGN_STYLE=Automatic \
    MARKETING_VERSION="$VERSION" \
    CURRENT_PROJECT_VERSION="$NEW_BUILD" \
    -quiet

echo "📤 Exporting IPA..."
cat > /tmp/PeiPeiExportOpts.plist << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>MNB3V4MHFJ</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
PLIST

rm -rf /tmp/PeiPei-ship-export
xcodebuild -exportArchive \
    -archivePath /tmp/PeiPei-ship.xcarchive \
    -exportOptionsPlist /tmp/PeiPeiExportOpts.plist \
    -exportPath /tmp/PeiPei-ship-export \
    -allowProvisioningUpdates \
    -quiet

IPA_PATH="/tmp/PeiPei-ship-export/PeiPei.ipa"
echo "   IPA: $IPA_PATH"

# Upload to App Store Connect
# Modern altool prefers --upload-package. The older --upload-app path can fail
# with misleading bundle/Apple ID errors even when the ASC app record is valid.
echo "☁️  Uploading to App Store Connect..."
xcrun altool --upload-package "$IPA_PATH" \
    --api-key "$ASC_KEY_ID" \
    --api-issuer "$ASC_ISSUER_ID"

echo "⏳ Waiting for Apple to process build..."
echo "   (This typically takes 5-15 minutes)"

# Poll ASC API for build processing status
# Internal test groups auto-get all builds — just wait for VALID state
python3 "$(dirname "$0")/distribute.py" "$VERSION" "$NEW_BUILD"

echo ""
echo "✅ PeiPei ${VERSION} (${NEW_BUILD}) shipped to TestFlight!"
echo "   Testers will be notified automatically."

# Commit version bump
git add PeiPei/Info.plist
git commit -m "build: ${VERSION} (${NEW_BUILD}) → TestFlight" --no-verify 2>/dev/null || true
git push 2>/dev/null || true
