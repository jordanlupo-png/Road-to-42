# Google Health activation

The app and Supabase functions are implemented. Live OAuth and Fitbit imports have **not** been verified because this project has no Google Health OAuth credentials yet.

## Google Cloud

Follow https://developers.google.com/health/setup using a project you administer.

1. Enable **Google Health API**.
2. Create a **Web application** OAuth client, preferably dedicated to the health integration so revoking health access does not revoke Google sign-in.
3. Add this exact authorized redirect URI:
   https://negkvlgimrthgonyvdqf.supabase.co/functions/v1/google-health-callback
4. Configure the consent screen, the app home page, privacy notice and terms. Add your and Julia's Google accounts as test users while the app is in Testing.
5. Request only this read-only scope:
   https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
6. In Supabase → Edge Functions → Secrets, securely set:
   - GOOGLE_HEALTH_CLIENT_ID
   - GOOGLE_HEALTH_CLIENT_SECRET
   - GOOGLE_HEALTH_WEBHOOK_SECRET (a separate random secret of at least 32 bytes)
   Do not commit secrets or paste them into chat. The OAuth secret derives the AES-GCM token encryption key; rotating it requires reconnecting existing health accounts.

## Automatic updates

Register a Google Health subscriber using the authorized project administrator or service account as described at https://developers.google.com/health/webhooks.

Endpoint:
https://negkvlgimrthgonyvdqf.supabase.co/functions/v1/google-health/webhook

Configuration (replace placeholders only in a secure administrator workflow):

```json
{
  "endpointUri": "https://negkvlgimrthgonyvdqf.supabase.co/functions/v1/google-health/webhook",
  "subscriberConfigs": [
    {"dataTypes": ["exercise"], "subscriptionCreatePolicy": "AUTOMATIC"}
  ],
  "endpointAuthorization": {"secret": "Bearer YOUR_WEBHOOK_SECRET"}
}
```

POST this configuration to the documented projects/{project-number}/subscribers endpoint with subscriberId=road42-running. The endpoint accepts the authorized verification handshake and rejects an unauthenticated handshake. Merely setting a webhook secret does **not** register the subscriber.

Notifications are authenticated with the shared secret, queued in Postgres, and processed by an Edge Function. Supabase Cron retries pending jobs once a minute, with a five-minute delay after failures. Runs can also be synced manually. No direct API polling happens while the queue is empty.

## Acceptance checks requiring real accounts

- Connect each runner's own Google Health account through Runner → Google Health.
- Record and sync one Run on the Sense 2 / Inspire 3. Confirm its distance and date match the source.
- Verify a walk, treadmill walk, bike ride, and a run before 14 September 2026 do not import.
- Trigger sync twice; confirm no duplicated XP.
- Test an existing matching manual entry: it should wait for review.
- Edit and delete a source run and verify the subsequent webhook updates the game.
- Leave the game closed, sync the watch, then reopen and verify automatic import.
- Revoke Google permission and verify reconnection is requested.
- Check Android Chrome and iPhone Safari, including installed Home Screen mode, keyboard opening, date controls, swiping each tab, and OAuth returning to the correct browser session.
- Test account deletion only with a disposable test account. Real user accounts were not deleted during implementation.

The importer reads exercise sessions, never daily step-distance totals. RUNNING, TRAIL_RUN and TREADMILL are accepted; TREADMILL_WALK and all other types are excluded. Missing distance is not estimated. Provider support for another brand depends on whether its running sessions are exposed through Google Health.

The first import starts on the recorded local date 2026-09-14. Full history is paginated with a limit of 100 pages and a 90-second fetch budget; exceeding this fails visibly without deleting existing runs. A larger deployment should move to windowed incremental imports.

## Security and storage

All three health tables deny direct anonymous/authenticated access. Service-only RPCs validate the owning account, lock concurrent imports, preserve local deletion tombstones, and make run linking atomic. Edge Functions validate the current user and live auth session. OAuth states expire after ten minutes and are single-use; PKCE is enabled. Tokens are encrypted at rest with AES-GCM and never sent to the frontend.

Disconnect stops future access while retaining imported training entries. Account deletion cascades through profiles, activities, check-ins, OAuth states, encrypted tokens and import records. Google token revocation is best-effort after local deletion.

## Verification already run

- Node unit tests for running filters, XP thresholds, weekly consistency, local dates, distance/pace conversions and invalid records.
- Rolled-back database fixture tests for character locking, import idempotency, updates, duplicate review, isolation, deletion tombstones and account cleanup.
- Live unauthorized HTTP probes for health, webhook, worker and delete-account endpoints (all 401).
- Supabase security advisors: health tables intentionally have no client policies; existing leaked-password protection warning concerns password auth, while this UI uses Google sign-in.

Real Google authorization and physical-device checks remain activation gates. Browser fixture checks use an in-memory backend and do not prove provider connectivity.
