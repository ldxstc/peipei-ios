#!/bin/bash
# One-time setup: Create an App Store Connect API key for automated TestFlight distribution
#
# Steps:
# 1. Go to https://appstoreconnect.apple.com/access/integrations/api
# 2. Click "+" to create a new key
# 3. Name: "PeiPei CI" 
# 4. Access: "Developer" (sufficient for TestFlight)
# 5. Download the .p8 file
# 6. Note the Key ID and Issuer ID from the page
# 7. Run this script:
#
#   ./scripts/setup-asc-key.sh <KEY_ID> <ISSUER_ID> <PATH_TO_P8>
#
# Example:
#   ./scripts/setup-asc-key.sh ABC123DEF4 69bf3597-22d8-4bd8-a05d-3940bb8210d8 ~/Downloads/AuthKey_ABC123DEF4.p8

set -e

KEY_ID="$1"
ISSUER_ID="$2"
P8_PATH="$3"

if [ -z "$KEY_ID" ] || [ -z "$ISSUER_ID" ] || [ -z "$P8_PATH" ]; then
    echo "Usage: $0 <KEY_ID> <ISSUER_ID> <PATH_TO_P8_FILE>"
    echo ""
    echo "Get these from: https://appstoreconnect.apple.com/access/integrations/api"
    exit 1
fi

# Store key securely
mkdir -p ~/.appstoreconnect/private_keys
cp "$P8_PATH" ~/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8

# Save config
cat > ~/.appstoreconnect/peipei.env << EOF
ASC_KEY_ID=${KEY_ID}
ASC_ISSUER_ID=${ISSUER_ID}
ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8
EOF

echo "✅ ASC API key configured!"
echo "   Key ID: ${KEY_ID}"
echo "   Issuer: ${ISSUER_ID}"
echo "   Key:    ~/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
echo ""
echo "You can now run: ./scripts/ship.sh"
