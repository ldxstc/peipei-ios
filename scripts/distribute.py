#!/usr/bin/env python3
"""
Poll App Store Connect for build processing, then add to test group.

Usage: python3 distribute.py <version> <build_number>

Env vars required:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    import jwt
    import requests
except ImportError:
    print("❌ Missing dependencies. Install with: pip3 install PyJWT requests")
    sys.exit(1)

APP_ID = "6761196995"  # PeiPei app ID in ASC
TEST_GROUP_NAME = "PeiPei-Run Testers"
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


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_build(token: str, version: str, build_number: str) -> dict | None:
    """Find a specific build by version and build number."""
    url = (
        f"https://api.appstoreconnect.apple.com/v1/builds"
        f"?filter[app]={APP_ID}"
        f"&filter[version]={build_number}"
        f"&filter[preReleaseVersion.version]={version}"
        f"&limit=1"
    )
    resp = requests.get(url, headers=auth_headers(token))
    resp.raise_for_status()
    builds = resp.json().get("data", [])
    return builds[0] if builds else None


def find_test_group(token: str) -> str | None:
    """Find the beta group ID by name."""
    url = (
        f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/betaGroups"
        f"?filter[name]={TEST_GROUP_NAME}"
        f"&limit=5"
    )
    resp = requests.get(url, headers=auth_headers(token))
    resp.raise_for_status()
    groups = resp.json().get("data", [])
    for g in groups:
        if g["attributes"]["name"] == TEST_GROUP_NAME:
            return g["id"]
    return None


def add_build_to_group(token: str, group_id: str, build_id: str) -> bool:
    """Add a build to a beta test group."""
    url = f"https://api.appstoreconnect.apple.com/v1/betaGroups/{group_id}/relationships/builds"
    body = {"data": [{"type": "builds", "id": build_id}]}
    resp = requests.post(url, headers=auth_headers(token), json=body)
    if resp.status_code in (200, 204):
        return True
    elif resp.status_code == 409:
        # Already added
        return True
    elif resp.status_code == 422:
        # Internal groups auto-get all builds — no assignment needed
        print(f"   ℹ️  '{TEST_GROUP_NAME}' is an internal group — builds are distributed automatically.")
        return True
    else:
        print(f"   ⚠️ Failed to add build to group: {resp.status_code} {resp.text[:200]}")
        return False


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
                    build_id = build["id"]
                    print(f"✅ Build is VALID (id: {build_id})")

                    # Find and add to test group
                    group_id = find_test_group(token)
                    if group_id:
                        print(f"📱 Adding to '{TEST_GROUP_NAME}' (group: {group_id})...")
                        if add_build_to_group(token, group_id, build_id):
                            print(f"✅ Build added to '{TEST_GROUP_NAME}' — testers notified!")
                        else:
                            print(f"⚠️ Could not add to group. Add manually in ASC.")
                    else:
                        print(f"⚠️ Test group '{TEST_GROUP_NAME}' not found. Add build manually.")

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
