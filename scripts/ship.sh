#!/bin/bash
# Build, archive, upload to TestFlight, and auto-distribute to testers
# Requires: setup-asc-key.sh to have been run first
set -e

cd "$(dirname "$0")/.."

# Load ASC credentials
if [ -f ~/.appstoreconnect/peipei.env ]; then
    source ~/.appstoreconnect/peipei.env
else
    echo "❌ No ASC API key configured. Run ./scripts/setup-asc-key.sh first."
    exit 1
fi

# Expand ~ in key path
ASC_KEY_PATH="${ASC_KEY_PATH/#\~/$HOME}"

echo "🏗️  Building PeiPei..."

# Auto-increment build number
CURRENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" PeiPei/Info.plist)
NEW_BUILD=$((CURRENT_BUILD + 1))
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" PeiPei/Info.plist
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" PeiPei/Info.plist)
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
echo "☁️  Uploading to App Store Connect..."
xcrun altool --upload-app \
    --type ios \
    --file "$IPA_PATH" \
    --apiKey "$ASC_KEY_ID" \
    --apiIssuer "$ASC_ISSUER_ID"

echo "⏳ Waiting for Apple to process build..."
echo "   (This typically takes 5-15 minutes)"

# Use fastlane pilot to wait for processing and distribute
echo "🚀 Distributing to testers..."
fastlane pilot distribute \
    --api_key_path <(cat << JSON
{
    "key_id": "${ASC_KEY_ID}",
    "issuer_id": "${ASC_ISSUER_ID}",
    "key": $(python3 -c "import json; print(json.dumps(open('${ASC_KEY_PATH}').read()))")
}
JSON
) \
    --app_identifier "com.peipei.app" \
    --distribute_external true \
    --notify_external_testers true \
    --groups "External Testers" \
    --app_version "$VERSION" \
    --build_number "$NEW_BUILD"

echo ""
echo "✅ PeiPei ${VERSION} (${NEW_BUILD}) shipped to TestFlight!"
echo "   Testers will be notified automatically."

# Commit version bump
git add PeiPei/Info.plist
git commit -m "build: ${VERSION} (${NEW_BUILD}) → TestFlight" --no-verify 2>/dev/null || true
git push 2>/dev/null || true
