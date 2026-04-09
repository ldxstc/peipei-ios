# Apple Sign-In — Implementation Plan

## What Needs to Change

### Server Side (web app at ~/personal/peipei)

The backend uses better-auth v1.4.19. Apple Sign-In with ID Token is supported natively.

1. Install `jose` package: `pnpm add jose`

2. Edit `src/lib/auth.ts`:
   - Add Apple social provider to `socialProviders`
   - Add `generateAppleClientSecret` function using jose
   - Add `appBundleIdentifier: "com.peipei.app"` (critical for iOS native ID token flow)
   - Add `"https://appleid.apple.com"` to `trustedOrigins`

3. Required env vars (Vercel + .env.local):
   - APPLE_CLIENT_ID — the Service ID (e.g. com.peipei.service)
   - APPLE_TEAM_ID — MNB3V4MHFJ
   - APPLE_KEY_ID — from the Sign In with Apple key
   - APPLE_PRIVATE_KEY — the .p8 key contents

### iOS Client Side (already mostly done)

The iOS app at ~/personal/peipei-ios already has:
- LoginView.swift with SignInWithAppleButton
- AppModel.signInWithApple() that extracts the identity token
- APIClient.signInWithApple() that calls /api/auth/sign-in/social

BUT the API path is wrong. better-auth uses `/api/auth/callback/apple` for OAuth redirect flow, 
but for ID Token flow from native iOS, we need to use the better-auth client's signIn.social endpoint.

The correct flow for native iOS → better-auth:
1. iOS gets ASAuthorizationAppleIDCredential with identityToken
2. iOS POSTs to `/api/auth/sign-in/social` with body:
   { "provider": "apple", "idToken": { "token": "<jwt>", "nonce": "<nonce>" } }
3. better-auth verifies the token, creates/links account, returns session

Actually, better-auth's REST API endpoint for this is:
POST /api/auth/sign-in/social
Body: { "provider": "apple", "idToken": { "token": "...", "nonce": "..." } }

This is already what the iOS client sends! So the client is correct.
The missing piece is the server config.

## Steps for Ada

### Step 1: Create Apple Sign In with Apple Key
Already have keys in Apple Developer Portal. Team ID: MNB3V4MHFJ. Bundle ID: com.peipei.app.

Need to create:
1. A Service ID (Identifiers → Service IDs) — e.g. "com.peipei.service" 
2. Configure it with Sign In with Apple capability
3. Add domain: peipei-run.com
4. Add return URL: https://www.peipei-run.com/api/auth/callback/apple
5. Create a Key (Keys → Sign In with Apple) → download .p8

### Step 2: Server Config
Ada will edit the web app auth.ts and set env vars.

### Step 3: iOS Client Verification
Verify the APIClient sends to the correct endpoint with correct body format.
