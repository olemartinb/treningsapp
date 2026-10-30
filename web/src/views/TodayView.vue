<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue';
import { ArrowLeftRight, Baby, CalendarDays, Clock, Flag, Lightbulb, Pin, RefreshCw, User } from 'lucide-vue-next';
import { api, ApiError, isRun, type DailyLog, type Today } from '../api';
import { WEEK_LABEL, dayBefore, formatKm, formatLongDate, formatShortDate, formatTime, formatWeekdayDate, greeting } from '../format';
import { suggestSession } from '../suggest';
import PageHeader from '../components/PageHeader.vue';
import PeriodStrip from '../components/PeriodStrip.vue';
import KneeTestCard from '../components/KneeTestCard.vue';
import WeightCard from '../components/WeightCard.vue';
import VolumeBar from '../components/VolumeBar.vue';
import ActivityList from '../components/ActivityList.vue';

const BASE_KM = { barneuke: '25–35', eneuke: '60–68' } as const;
/** Opening the app pulls new Garmin activities if the last sync is older than this. */
const SYNC_STALE_MS = 10 * 60_000;
const SYNC_ERRORS: Record<string, string> = {
  intervals_auth_failed: 'intervals.icu avviste nøkkelen. Sjekk API-nøkkel og athlete ID.',
  intervals_unavailable: 'intervals.icu svarer ikke akkurat nå.',
};

const today = ref<Today | null>(null);
const error = ref<string | null>(null);
const googleConfigured = ref(true);
const syncing = ref(false);
const syncError = ref<string | null>(null);

async function load() {
  try {
    today.value = await api.today();
    error.value = null;
    if (!today.value.calendar) googleConfigured.value = (await api.googleStatus()).configured;
  } catch (e) {
    error.value = e instanceof ApiError ? `Feil fra serveren: ${e.message}` : 'Får ikke kontakt med serveren';
  }
}

async function sync() {
  syncing.value = true;
  syncError.value = null;
  try {
    await api.sync();
    await load();
  } catch (e) {
    syncError.value = e instanceof ApiError ? (SYNC_ERRORS[e.code] ?? `Synk feilet: ${e.code}`) : 'Synk feilet';
  } finally {
    syncing.value = false;
  }
}

async function init() {
  await load();
  const t = today.value?.training;
  if (t?.configured && (!t.lastSyncAt || Date.now() - Date.parse(t.lastSyncAt) > SYNC_STALE_MS)) await sync();
}

function onSaved(log: DailyLog) {
  if (!today.value) return;
  today.value.log = log;
  void load(); // refresh the 7-day average
}

const day = computed(() => today.value?.calendar?.day ?? null);
const period = computed(() => today.value?.calendar?.period ?? null);
const dayNo = computed(() => {
  if (!period.value || !today.value) return 0;
  return Math.round((Date.parse(today.value.date) - Date.parse(period.value.start)) / 86_400_000) + 1;
});
const flags = computed(() => (day.value?.flags ?? []).filter((f) => !(day.value?.handover && /^bytte/i.test(f.title))));
const suggestion = computed(() => (today.value ? suggestSession(day.value, today.value.log) : null));
const training = computed(() => today.value?.training ?? null);
const ranToday = computed(() => training.value?.activities.some(isRun) ?? false);

// Tint the whole app with the current week type (kept when switching tabs).
watchEffect(() => {
  if (day.value?.type) document.documentElement.dataset.week = day.value.type;
});
onMounted(init);
</script>

<template>
  <div class="stack">
    <PageHeader :overline="today ? formatLongDate(today.date) : ' '" :title="greeting()" />

    <p v-if="error" class="card error rise" role="alert">{{ error }}</p>

    <template v-if="today">
      <!-- Week type -->
      <section v-if="!today.calendar" class="card connect rise" style="--i: 1">
        <p class="eyebrow"><CalendarDays aria-hidden="true" /> Kalender</p>
        <h2>Koble til kalenderen</h2>
        <p v-if="googleConfigured" class="muted small">Barneuke, eneuke, bytter og løp hentes fra Google Kalender.</p>
        <p v-else class="muted small">GOOGLE_CLIENT_ID og GOOGLE_CLIENT_SECRET mangler som Worker-secrets.</p>
        <a v-if="googleConfigured" class="btn primary" href="/api/auth/google/start">Koble til Google</a>
      </section>

      <section v-else class="card hero rise" style="--i: 1">
        <div class="hero-top">
          <span class="type">
            <Baby v-if="day?.type === 'barneuke'" aria-hidden="true" />
            <User v-else aria-hidden="true" />
            {{ day?.type ? WEEK_LABEL[day.type] : 'Ukjent uke' }}
          </span>
          <span v-if="period" class="small muted">dag {{ dayNo }} av {{ period.days }}</span>
        </div>

        <template v-if="period">
          <template v-if="training?.volume">
            <p class="target">
              <span class="num">{{ formatKm(training.volume.km) }}</span>
              <span class="unit">av {{ formatKm(period.target.min) }}–{{ formatKm(period.target.max) }} km</span>
            </p>
            <VolumeBar :volume="training.volume" :target="period.target" />
          </template>
          <p v-else class="target">
            <span class="num">{{ formatKm(period.target.min) }}–{{ formatKm(period.target.max) }}</span>
            <span class="unit">km</span>
          </p>
          <p class="small muted sub">
            {{ formatShortDate(period.start) }} – {{ formatShortDate(dayBefore(period.end)) }}
            <template v-if="period.provisional"> · foreløpig</template>
          </p>
          <p v-if="period.target.scaled" class="scaled small">
            {{ period.days < 7 ? 'Kort' : 'Lang' }} periode, {{ period.days }} dager · skalert fra {{ BASE_KM[period.type] }} km/uke
          </p>
          <PeriodStrip :days="today.calendar.periodDays" :today="today.date" :km-by-date="training?.volume?.kmByDate" />
        </template>

        <ul v-if="day && (day.handover || flags.length)" class="flags">
          <li v-if="day.handover">
            <ArrowLeftRight aria-hidden="true" />
            <span>Bytte i dag<template v-if="day.handover.time"> kl. <strong class="num">{{ day.handover.time }}</strong></template></span>
            <span class="to">→ {{ WEEK_LABEL[day.handover.to] }}</span>
          </li>
          <li v-for="f in flags" :key="f.title + f.time">
            <Baby v-if="f.kind === 'kids-home-all-day'" aria-hidden="true" />
            <Clock v-else-if="f.kind === 'timed'" aria-hidden="true" />
            <Pin v-else aria-hidden="true" />
            <span v-if="f.kind === 'kids-home-all-day'" class="two">
              Barna hjemme hele dagen
              <small>{{ f.title }}</small>
            </span>
            <span v-else-if="f.kind === 'timed'"><strong class="num">{{ f.time }}</strong> {{ f.title }}</span>
            <span v-else>{{ f.title }}</span>
          </li>
        </ul>
      </section>

      <KneeTestCard class="rise" style="--i: 2" :log="today.log" @saved="onSaved" />
      <WeightCard class="rise" style="--i: 3" :log="today.log" :weight="today.weight" @saved="onSaved" />

      <section class="card rise" style="--i: 4">
        <div class="session-head">
          <p class="eyebrow"><Lightbulb aria-hidden="true" /> Dagens økt</p>
          <button
            v-if="training?.configured"
            class="sync small"
            :disabled="syncing"
            aria-label="Hent nye økter fra Garmin"
            @click="sync"
          >
            <RefreshCw :class="{ spin: syncing }" aria-hidden="true" />
            <template v-if="syncing">Henter …</template>
            <template v-else-if="training.lastSyncAt">{{ formatTime(training.lastSyncAt) }}</template>
            <template v-else>Hent</template>
          </button>
        </div>

        <ActivityList v-if="training?.activities.length" :activities="training.activities" />

        <template v-if="suggestion && !ranToday">
          <h3 :class="{ later: training?.activities.length }">{{ suggestion.title }}</h3>
          <p class="small muted">{{ suggestion.detail }}</p>
        </template>

        <p v-if="syncError" class="footnote small sync-error" role="alert">{{ syncError }}</p>
        <p v-else-if="training?.hiddenActivities" class="footnote small hint">
          {{ training.hiddenActivities }} økter i intervals.icu kom via Strava, og dem deler ikke intervals.icu med andre apper.
          Øktene må komme direkte fra Garmin.
        </p>
        <p v-else-if="training?.configured && training.lastSyncAt && !training.cachedActivities" class="footnote small hint">
          intervals.icu har ingen økter ennå. Har du nettopp koblet til Garmin, bruk «Import All Garmin Data» i intervals.icu
          for å hente historikken.
        </p>
        <p v-else-if="!training?.configured" class="footnote small">Garmin-økter vises her når intervals.icu er koblet til.</p>
      </section>

      <section v-if="today.nextRace" class="card race rise" style="--i: 5">
        <div>
          <p class="eyebrow"><Flag aria-hidden="true" /> Neste løp</p>
          <h3>{{ today.nextRace.title }}</h3>
          <p class="small muted">{{ formatWeekdayDate(today.nextRace.date) }}</p>
        </div>
        <p class="countdown">
          <template v-if="today.nextRace.inDays === 0"><span class="big">I dag</span></template>
          <template v-else>
            <span class="big num">{{ today.nextRace.inDays }}</span>
            <span class="small muted">{{ today.nextRace.inDays === 1 ? 'dag' : 'dager' }}</span>
          </template>
        </p>
      </section>
    </template>

    <div v-else-if="!error" class="skeleton" aria-busy="true">
      <div class="card" /><div class="card" /><div class="card" />
    </div>
  </div>
</template>

<style scoped>
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }

h2, h3 { margin: 0 0 4px; letter-spacing: -0.02em; }
h2 { font-size: 22px; font-weight: 650; }
h3 { font-size: 18px; font-weight: 600; }
p { margin: 0; }

.connect .btn { margin-top: 16px; width: 100%; }

.hero {
  overflow: hidden;
  background:
    radial-gradient(130% 90% at 0% 0%, color-mix(in oklch, var(--week) 30%, transparent), transparent 62%),
    var(--surface);
  border-color: color-mix(in oklch, var(--week) 22%, var(--border));
}
.hero-top { display: flex; justify-content: space-between; align-items: center; }
.type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 10px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--week) 18%, transparent);
  color: var(--week);
  font-weight: 650;
}
.type svg { width: 18px; height: 18px; }
.target { display: flex; align-items: baseline; gap: 8px; margin-top: 20px; }
.target .num { font-size: clamp(44px, 15vw, 64px); font-weight: 600; line-height: 1; letter-spacing: -0.05em; }
.target .unit { font-size: 20px; font-weight: 550; color: var(--muted); }
.sub { margin: 6px 0 16px; }
.scaled {
  margin: -8px 0 16px;
  color: var(--warn);
}

.flags { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 6px; }
.flags li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--surface-2) 80%, transparent);
  font-size: 15px;
}
.flags svg { flex: none; width: 18px; height: 18px; color: var(--week); }
.flags .to { margin-left: auto; color: var(--muted); font-size: 13px; text-align: right; }
.flags .two { display: grid; }
.flags small { color: var(--muted); font-size: 13px; }

.session-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.sync {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: -6px -8px 0 0;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.sync svg { width: 15px; height: 15px; }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.later { margin-top: 16px; }
.sync-error { color: var(--bad); }
.hint { color: var(--warn); }
.footnote { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--faint); }

.race { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.countdown { display: grid; justify-items: end; text-align: right; }
.countdown .big { font-size: 48px; font-weight: 600; line-height: 1; letter-spacing: -0.04em; }

.error { color: var(--bad); }

.skeleton { display: grid; gap: 12px; }
.skeleton .card { height: 160px; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.55; } }
</style>
