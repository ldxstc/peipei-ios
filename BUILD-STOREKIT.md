# StoreKit 2 Integration — PeiPei Pro

## Product Setup (App Store Connect)
- Product ID: `com.peipei.pro.monthly`
- Price: $19.99/mo
- Subscription Group: "PeiPei Pro"

## iOS Implementation

### StoreManager.swift
- Load products from App Store
- Handle purchase flow
- Listen for transaction updates
- Verify subscription status
- Restore purchases

### PaywallView.swift
- Shows current tier (Free/Pro)
- Pro benefits list
- Purchase button
- Restore purchases link
- Terms of service / privacy policy links

### Integration Points
- Settings: "Tier" row → taps to Paywall
- After purchase: POST /api/subscription/apple with transaction info
- App launch: check entitlement status

## Server Endpoint
POST /api/subscription/apple
Body: { originalTransactionId, productId, environment }
- Verify with App Store Server API
- Update user.subscriptionTier = "pro"
- Return { success, tier }

## App Store Server Notifications v2
POST /api/webhooks/apple
- Handle SUBSCRIBED, DID_RENEW, EXPIRED, DID_REVOKE
- Update user tier accordingly
