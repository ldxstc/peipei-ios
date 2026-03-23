# Push Token Endpoint Spec

## Endpoint

`POST /api/user/push-token`

## Purpose

Register a mobile device push token for the authenticated user so the PeiPei backend can send proactive coach notifications.

## Authentication

- Required header: `X-Session-Token: <session token>`
- Optional backward compatibility: `Cookie: peipei.session_token=<session token>`

## Request Body

```json
{
  "token": "ExponentPushToken[...] or APNs/FCM device token",
  "platform": "ios"
}
```

Supported `platform` values:

- `ios`
- `android`

## Response

Success:

```json
{
  "registered": true
}
```

Validation error:

```json
{
  "message": "Invalid push token."
}
```

## Storage

Persist registrations in a `user_push_tokens` table with at least:

- `id`
- `user_id`
- `token`
- `platform`
- `created_at`
- `updated_at`
- `last_seen_at`
- `revoked_at` nullable

## Expected Behavior

- Upsert by `(user_id, token)`
- Refresh `updated_at` / `last_seen_at` on repeat registrations
- Allow multiple active devices per user
- Mark tokens revoked when APNs/FCM reports them invalid

## Notes For Mobile

- The current iOS client already sends `X-Session-Token`
- Until this endpoint exists, the mobile app treats `404` and network failures as a silent no-op
