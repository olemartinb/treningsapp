# Treningsapp

Personal training dashboard: kid weeks from Google Calendar, knee test + weight log, and (soon) Garmin activities via intervals.icu. See `CLAUDE.md` for the full brief.

```
server/   Fastify + better-sqlite3 API (holds all secrets, proxies Google/intervals.icu)
web/      Vue 3 + Vite + TypeScript, mobile first
```

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env
```

Then fill in `.env` (see below) and run:

```bash
npm run dev        # API on :8787, Vite on :5173 (proxies /api)
npm test           # unit + API tests (kid-week resolver, targets, log)
npm run build && npm start   # production: API serves the built web app on :8787
```

### Google Calendar (read-only)

1. In Google Cloud Console: create a project, enable **Google Calendar API**.
2. OAuth consent screen: type *External*, add yourself as a test user, scope `.../auth/calendar.readonly`.
   Publish the app ("In production") or refresh tokens expire after 7 days in testing mode.
3. Credentials → **OAuth client ID** → *Web application*. Add the redirect URI
   `<PUBLIC_URL>/api/auth/google/callback`, and put the client id/secret in `.env`.
4. Open the app and tap **Koble til Google**. The refresh token is stored in SQLite, never in the browser.

Google only accepts `https://` redirect URIs or `http://localhost`. Over Tailscale, either:
- run `tailscale serve --bg 8787` and set `PUBLIC_URL=https://<machine>.<tailnet>.ts.net`, or
- do the one-time connect through a tunnel: `ssh -L 8787:localhost:8787 <homeserver>`, with `PUBLIC_URL=http://localhost:8787`.

Calendars are found by name (`CAL_KIDS_NAME`, `CAL_RACES_NAME`), not by id.

### intervals.icu

`INTERVALS_API_KEY` and `INTERVALS_ATHLETE_ID` from intervals.icu → Settings → Developer. (Used from step 4.)

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
| GET | `/api/today` | Week type, flags, period target, today's log, next race |
| GET | `/api/calendar/days?from&to[&refresh=true]` | Day-by-day kid-week info + periods with targets |
| GET | `/api/calendar/races?from&to` | Races from "Løp / trening" |
| GET | `/api/log?from&to` · `/api/log/:date` | Knee test + weight |
| PUT | `/api/log/:date` | `{ kneeOk?, kneeNote?, weightKg? }` (partial update) |
| GET | `/api/auth/google/status` · `/start` · `/callback`, POST `/disconnect` | OAuth |

## Status

- [x] 1. Scaffold Vue + API + SQLite
- [x] 2. Google Calendar OAuth + week-type resolver (tested against real-shaped events)
- [x] 3. Knee test + weight log (Today view)
- [ ] 4. intervals.icu sync + activity cache
- [ ] 5. Week and Today views (planned vs. logged, run-without-knee-test flags)
- [ ] 6. Plan view
- [ ] 7. Progress charts
