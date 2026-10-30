# Treningsapp

Personal training dashboard: kid weeks from Google Calendar, knee test + weight log, and (soon) Garmin activities via intervals.icu. See `CLAUDE.md` for the full brief.

```
server/   Cloudflare Worker (Hono) + D1 – holds all secrets, proxies Google/intervals.icu
web/      Vue 3 + Vite + TypeScript, mobile first, served as Worker static assets
```

Hosting is always Cloudflare: one Worker serves `/api/*` and the built web app, data lives in D1,
and Cloudflare Access keeps it private.

## Local development

Requires Node 22+.

```bash
npm install
cp .dev.vars.example .dev.vars   # ALLOW_UNAUTHENTICATED=true is for local only
npm run dev                      # Worker + local D1 on :8787, Vite on :5173 (proxies /api)
npm test                         # resolver, targets, API, Access JWT verification
```

## Deploy to Cloudflare

Needs `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1: Edit, Access: Apps and Policies: Edit,
Account Settings: Read) and `CLOUDFLARE_ACCOUNT_ID` in the environment.

1. **Database.** `npx wrangler d1 create treningsapp`, then put the returned `database_id` into
   `wrangler.jsonc` (newer wrangler versions can also create it on the first deploy).
2. **Deploy.** `npm run deploy` builds the web app, applies D1 migrations and deploys the Worker
   to `https://treningsapp.<subdomain>.workers.dev`.
3. **Lock it down with Cloudflare Access.** Zero Trust → Access → Applications → add a self-hosted
   app for the Worker hostname with an *Allow* policy for your own email. Copy the team domain
   (`<team>.cloudflareaccess.com`) and the Application Audience tag into `ACCESS_TEAM_DOMAIN` /
   `ACCESS_AUD` in `wrangler.jsonc` and deploy again. Until both are set the API answers
   `503 access_not_configured`; it never runs open.
4. **Secrets.** `npx wrangler secret put GOOGLE_CLIENT_ID` (and `GOOGLE_CLIENT_SECRET`,
   `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`).

### Google Calendar (read-only)

1. Google Cloud Console: create a project, enable **Google Calendar API**.
2. OAuth consent screen: *External*, add yourself as test user, scope `.../auth/calendar.readonly`.
   Publish it ("In production") or refresh tokens expire after 7 days.
3. Credentials → **OAuth client ID** → *Web application*, redirect URIs
   `https://treningsapp.<subdomain>.workers.dev/api/auth/google/callback` and
   `http://localhost:8787/api/auth/google/callback` (local dev).
4. Open the app and tap **Koble til Google**. The refresh token is stored in D1, never in the browser.

Calendars are found by name (`CAL_KIDS_NAME`, `CAL_RACES_NAME` in `wrangler.jsonc`), not by id.

## How kid weeks are resolved

`server/src/calendar/kidWeeks.ts`. Pappaveke → **barneuke**, Mammaveke → **eneuke**. Each event's end overlaps the
next event's start by one day; that shared day is the handover and belongs to the incoming week. A period runs from its
start to the next period's start, so holiday shifts (autumn break, Christmas) come straight from the calendar. "Bytte" gives
the handover time; other all-day events in a barneuke mean the kids are home all day. The last known period is marked
*provisional*.

Km targets (`server/src/training/targets.ts`) scale with period length: a 4-day eneuke gets 60–68 × 4/7 = 34,3–38,9 km.
A Mon–Sun week spanning a handover blends both types day by day.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/today` | Week type, flags, period + day strip, target, today's log, 7-day weight average, next race |
| GET | `/api/calendar/days?from&to[&refresh=true]` | Day-by-day kid-week info + periods with targets |
| GET | `/api/calendar/races?from&to` | Races from "Løp / trening" |
| GET | `/api/log?from&to` · `/api/log/:date` | Knee test + weight |
| PUT | `/api/log/:date` | `{ kneeOk?, kneeNote?, weightKg? }` (partial update) |
| GET | `/api/auth/google/status` · `/start` · `/callback`, POST `/disconnect` | OAuth |

## Status

- [x] 1. Scaffold Vue + Worker API + D1 on Cloudflare
- [x] 2. Google Calendar OAuth + week-type resolver (tested against real-shaped events)
- [x] 3. Knee test + weight log (Today view)
- [ ] 4. intervals.icu sync + activity cache (nightly via Cron Trigger)
- [ ] 5. Week and Today views (planned vs. logged, run-without-knee-test flags)
- [ ] 6. Plan view
- [ ] 7. Progress charts
