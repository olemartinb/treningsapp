# Treningsapp – project brief for Claude Code

Personal training dashboard for one runner (me). Pulls together calendar, kid weeks, Garmin activity data, the training plan, effort/progress, and a daily knee + weight log in one app.

## Goals the app serves
- Sub-1:20 half marathon in May 2027 → 3:47/km over 21.1 km
- Sub-3:00 marathon
- Body weight towards ~68 kg (currently ~71–72.6 kg fasting)
- Keep the left knee (patellar tendon) healthy while volume goes up

## Stack
- Frontend: Vue 3 + Vite + TypeScript, Composition API, `<script setup>`
- Backend: small Node (Fastify or Express) API that holds secrets and proxies external APIs. The browser never sees an API key.
- Storage: SQLite (better-sqlite3) for logs, plans and cached activities
- Hosting: runs at home, reachable over Tailscale (same setup as Home Assistant). No public exposure.
- Secrets in `.env` (gitignored). Provide `.env.example` with empty values only.

## Data sources

### 1. Google Calendar (Google Calendar API, OAuth, read-only scope)
- Kid weeks live in a separate calendar named **"Samvær"** (not the primary calendar).
  - All-day events titled **"Pappaveke"** = I have the kids → **barneuke**
  - All-day events titled **"Mammaveke"** = no kids → **eneuke**
  - Handover is usually Friday, and the end date of one event overlaps the start of the next. Holidays (Christmas, autumn) break the 2-week pattern, so ALWAYS read the calendar; never compute the cycle.
  - Other events in that calendar (e.g. "BHG planleggingsdag", "Bytte" with a time) are relevant flags: kids home all day / exact handover time.
- Races live in a calendar named **"Løp / trening"** (all-day events, e.g. "Rotevatnet rundt").
- Find calendars by name via the calendarList endpoint, not hardcoded IDs.

### 2. Activities: intervals.icu API (free, syncs from Garmin Connect)
- Auth: HTTP Basic, username `API_KEY`, password = personal API key from intervals.icu settings. Athlete id also from settings. Both go in `.env`.
- Use: activities list (distance, moving time, avg pace, avg/max HR, type), wellness (weight if synced), fitness/fatigue/form (CTL/ATL/TSB).
- Cache activities in SQLite; sync on demand + nightly.
- No Strava. No Garmin scraping.

### 3. Manual input (in the app)
- Daily knee test + weight (see below)
- Planned sessions per week

## Training rules the app must encode

### Week types
| Type | Volume target | Notes |
|---|---|---|
| Eneuke (Mammaveke) | 60–68 km over 4–5 runs | Long run, big threshold session, VO2/fart session, 2 easy runs |
| Barneuke (Pappaveke) | 25–35 km | Early morning runs before kids wake, or treadmill/spin bike after 20:00 |

Short weeks (fewer than 7 days between handovers) scale the target proportionally. Show this.

### Eneuke template
- Long run: 20–22 km (14–15 km Z2, last 6–8 km progressing to 3:47–3:52/km)
- Threshold: 10–12 km at threshold, e.g. 3×4 km or 4×3 km @ 3:45–3:50/km, 2 min jog
- Fart/VO2max: hill intervals or 10–12×400 m @ 3:25–3:30/km
- 2× easy 8–12 km in Z1/Z2

### Barneuke template
- 2× morning run 30–45 min Z2 (6–9 km)
- Treadmill 45 min: 10×2 min at 15–18% incline (Z4/5), 1 min flat recovery
- Spin bike 45–60 min: 4×8 min or 5×6 min at threshold, cadence ≥ 90
- Jump rope 10–15 min (1000–1500 skips)

### Hard rules
- **Knee test before every run:** 5 deep single-leg squats on the left leg + stairs. Must be 100% pain-free. If not → the run is replaced with spin bike / treadmill walking. The app shows a big "Knee OK today?" check on the today view and flags any logged run on a day with a failed or missing test.
- **Volume discipline:** flag weeks that exceed the planned km. Extra km is not a win.
- Strength 1–2×/week (squats, Bulgarian split squats, RDL, heavy calf raises) + eccentric single-leg decline squats 3×10–12 on slant board. Track as a checkbox per session.
- No hard sessions when sick or right before a target race.

## Views (v1)
1. **Today** – week type (barneuke/eneuke) and day-specific flags (handover, kids home all day), knee test button, weight input, today's planned session vs. what Garmin logged.
2. **Week** – 7-day grid with kid-week coloring, planned vs. completed per day, km bar: done / target range. Navigate weeks.
3. **Plan** – next 8 weeks with week type from the calendar, races marked, target km per week. Edit planned sessions.
4. **Progress** – charts:
   - Weekly km vs. target band, colored by week type
   - Threshold session paces over time vs. 3:47/km line
   - Easy-run pace at given HR (aerobic efficiency) trend
   - Weight vs. 68 kg target (7-day rolling average, not daily noise)
   - CTL/ATL/TSB from intervals.icu
   - Knee test history (pass/fail streak)

## Design
- Mobile first. It's used on a phone in the morning.
- Dark mode by default, light mode supported.
- Norwegian labels in the UI (Barneuke, Eneuke, Knetest, Vekt, Plan, Fremgang).
- Paces as mm:ss/km, weight in kg with one decimal.

## Build order
1. Scaffold Vue + API + SQLite, `.env.example`, README with setup steps
2. Google Calendar OAuth + week-type resolver (unit-test the overlap/handover logic against real-shaped events)
3. Manual log: knee test + weight
4. intervals.icu sync + activity cache
5. Week and Today views
6. Plan view
7. Progress charts

## Conventions
- Never commit `.env`, tokens or the SQLite file.
- Keep external API calls in the backend only.
- Small, typed modules; tests for date/week logic (timezone Europe/Oslo).
