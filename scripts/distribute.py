#!/usr/bin/env python3
"""
Poll App Store Connect for build processing status.
Internal test groups auto-get all builds, so no group assignment needed.
Just wait until the build reaches VALID state.

Usage: python3 distribute.py <version> <build_number>

Env vars required:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import jwt
    import requests
except ImportError:
    print("❌ Missing dependencies. Install with: pip3 install PyJWT requests")
    sys.exit(1)

APP_ID = "6761196995"  # PeiPei app ID in ASC
POLL_INTERVAL = 30  # seconds
MAX_WAIT = 1200  # 20 minutes


def generate_token(key_id: str, issuer_id: str, key_path: str) -> str:
    """Generate a short-lived JWT for App Store Connect API."""
    key_path = os.path.expanduser(key_path)
    with open(key_path, "r") as f:
        private_key = f.read()

    now = datetime.now(timezone.utc)
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "aud": "appstoreconnect-v1",
    }

    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": key_id})


def get_build(token: str, version: str, build_number: str) -> dict | None:
    """Find a specific build by version and build number."""
    headers = {"Authorization": f"Bearer {token}"}
    url = (
        f"https://api.appstoreconnect.apple.com/v1/builds"
        f"?filter[app]={APP_ID}"
        f"&filter[version]={build_number}"
        f"&filter[preReleaseVersion.version]={version}"
        f"&limit=1"
    )

    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    data = resp.json()

    builds = data.get("data", [])
    return builds[0] if builds else None


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <version> <build_number>")
        sys.exit(1)

    version = sys.argv[1]
    build_number = sys.argv[2]

    key_id = os.environ.get("ASC_KEY_ID")
    issuer_id = os.environ.get("ASC_ISSUER_ID")
    key_path = os.environ.get("ASC_KEY_PATH")

    if not all([key_id, issuer_id, key_path]):
        print("❌ Missing ASC_KEY_ID, ASC_ISSUER_ID, or ASC_KEY_PATH env vars")
        sys.exit(1)

    token = generate_token(key_id, issuer_id, key_path)
    start = time.time()

    print(f"⏳ Polling for build {version} ({build_number})...")

    while time.time() - start < MAX_WAIT:
        try:
            # Regenerate token every 10 minutes to avoid expiry
            if time.time() - start > 600:
                token = generate_token(key_id, issuer_id, key_path)

            build = get_build(token, version, build_number)

            if build:
                state = build["attributes"]["processingState"]
                print(f"   Build state: {state}")

                if state == "VALID":
                    print("✅ Build is VALID — available in TestFlight!")
                    return
                elif state == "FAILED":
                    print("❌ Build processing FAILED")
                    sys.exit(1)
                elif state == "INVALID":
                    print("❌ Build is INVALID")
                    sys.exit(1)
            else:
                print("   Build not yet visible in ASC...")

        except Exception as e:
            print(f"   ⚠️ Poll error: {e}")

        time.sleep(POLL_INTERVAL)

    print(f"⏰ Timed out after {MAX_WAIT}s waiting for build processing")
    print("   Build may still be processing — check ASC manually")
    sys.exit(1)


if __name__ == "__main__":
    main()
