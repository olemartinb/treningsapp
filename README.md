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

Plan templates (`server/src/plan/template.ts`) follow the eneuke/barneuke templates in `CLAUDE.md`: a 7-day period
starting on the handover day gets them as written (eneuke 60 km, barneuke 28 km); shorter periods keep the
highest-priority sessions and longer ones add easy runs, always within the scaled target. Hard sessions are kept
apart, races go on race day, the day before a race only gets an easy run, and existing sessions are never touched.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/today` | Week type, flags, period + day strip, km vs target, today's plan and activities, knee/weight log, next race |
| GET | `/api/week?start=` | Mon–Sun: kid-week type, plan, activities, knee status and blended target per day |
| GET | `/api/plan?weeks=8` | Upcoming periods: target, run + planned km, sessions per day |
| POST | `/api/plan/sessions` · PATCH/DELETE `/api/plan/sessions/:id` | Planned sessions (`{ date, kind, title?, km?, details?, done? }`) |
| POST | `/api/plan/fill` | `{ periodStart }` – fill a period from the week-type template |
| GET | `/api/progress?weeks=26` | Weekly km vs target, threshold pace, easy-run efficiency, weight, CTL/ATL/TSB, knee history |
| GET | `/api/calendar/days?from&to[&refresh=true]` | Day-by-day kid-week info + periods with targets |
| GET | `/api/calendar/races?from&to` | Races from "Løp / trening" |
| GET | `/api/log?from&to` · `/api/log/:date` | Knee test + weight |
| PUT | `/api/log/:date` | `{ kneeOk?, kneeNote?, weightKg? }` (partial update) |
| POST | `/api/sync` | Pull activities + wellness from intervals.icu (backfills 180 days until history is found) |
| GET | `/api/activities?from&to` | Cached activities |
| GET | `/api/auth/google/status` · `/start` · `/callback`, POST `/disconnect` | OAuth |

## Status

- [x] 1. Scaffold Vue + Worker API + D1 on Cloudflare
- [x] 2. Google Calendar OAuth + week-type resolver (tested against real-shaped events)
- [x] 3. Knee test + weight log (Today view)
- [x] 4. intervals.icu sync + activity cache (on open when stale, nightly via Cron Trigger)
- [x] 5. Week and Today views (planned vs. logged, run-without-knee-test flags)
- [x] 6. Plan view (template fill, editable sessions, strength done-checkbox)
- [x] 7. Progress charts

Known limits: threshold pace is the whole-session average (warm-up and jog recoveries included), not the work
intervals; easy runs are "average HR ≤ 150, ≥ 4 km"; older activities uploaded to intervals.icu after the
backfill are only picked up within the last 6 weeks.
