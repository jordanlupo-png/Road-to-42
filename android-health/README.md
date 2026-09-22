# Road to 42 — Android Health Connect companion

Native Android bridge: Health Connect → Supabase → Road to 42.

## MVP
- Google/Supabase sign-in using PKCE
- Read-only Health Connect permissions
- Imports running exercise sessions and distance
- Syncs the last 30 days to `public.activities`
- `source=health_connect` and Health Connect metadata ID prevent duplicate imports
- No service-role or server secret is shipped in the app

## OAuth redirect
The Supabase Auth redirect allow-list must include `roadto42://auth`.

## Build
GitHub Actions builds a debug APK from the `health-connect` branch and publishes it as the `road-to-42-health-debug` workflow artifact.
