<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError, type DailyLog, type Today } from '../api';
import { WEEK_LABEL, dayBefore, formatKm, formatLongDate, formatShortDate } from '../format';
import KneeTestCard from '../components/KneeTestCard.vue';
import WeightCard from '../components/WeightCard.vue';

const BASE_KM = { barneuke: '25–35', eneuke: '60–68' } as const;

const today = ref<Today | null>(null);
const error = ref<string | null>(null);
const googleConfigured = ref(true);

async function load() {
  error.value = null;
  try {
    today.value = await api.today();
    if (!today.value.calendar) googleConfigured.value = (await api.googleStatus()).configured;
  } catch (e) {
    error.value = e instanceof ApiError ? `Feil fra serveren: ${e.message}` : 'Får ikke kontakt med serveren';
  }
}

function onSaved(log: DailyLog) {
  if (today.value) today.value.log = log;
}

const day = computed(() => today.value?.calendar?.day ?? null);
const period = computed(() => today.value?.calendar?.period ?? null);
const dayNo = computed(() => {
  if (!period.value || !today.value) return 0;
  return Math.round((Date.parse(today.value.date) - Date.parse(period.value.start)) / 86_400_000) + 1;
});

onMounted(load);
</script>

<template>
  <div class="stack">
    <p v-if="error" class="card error">{{ error }}</p>

    <template v-if="today">
      <h1>{{ formatLongDate(today.date) }}</h1>

      <section v-if="!today.calendar" class="card">
        <h2>Kalender</h2>
        <p v-if="googleConfigured">Koble til Google Kalender for å se barneuke/eneuke og løp.</p>
        <p v-else class="muted small">Legg inn GOOGLE_CLIENT_ID og GOOGLE_CLIENT_SECRET i .env og start serveren på nytt.</p>
        <a v-if="googleConfigured" class="btn primary connect" href="/api/auth/google/start">Koble til Google</a>
      </section>

      <section v-else class="card week">
        <h2>Uketype</h2>
        <span class="chip big" :class="day?.type ?? 'unknown'">{{ day?.type ? WEEK_LABEL[day.type] : 'Ukjent' }}</span>

        <template v-if="period">
          <p class="small muted">
            {{ formatShortDate(period.start) }} – {{ formatShortDate(dayBefore(period.end)) }} · dag {{ dayNo }} av {{ period.days }}
            <span v-if="period.provisional">(foreløpig)</span>
          </p>
          <p class="target">
            Mål <strong>{{ formatKm(period.target.min) }}–{{ formatKm(period.target.max) }} km</strong>
          </p>
          <p v-if="period.target.scaled" class="small warn">
            {{ period.days < 7 ? 'Kort' : 'Lang' }} periode ({{ period.days }} dager) – skalert fra {{ BASE_KM[period.type] }} km/uke
          </p>
        </template>

        <ul v-if="day && (day.handover || day.flags.length)" class="flags">
          <li v-if="day.handover">
            🔁 Bytte i dag<template v-if="day.handover.time"> kl. {{ day.handover.time }}</template>
            → {{ WEEK_LABEL[day.handover.to] }}
          </li>
          <li v-for="f in day.flags.filter((f) => !(day!.handover && /^bytte/i.test(f.title)))" :key="f.title + f.time">
            <template v-if="f.kind === 'kids-home-all-day'">👧 Barna hjemme hele dagen – {{ f.title }}</template>
            <template v-else-if="f.kind === 'timed'">🕒 {{ f.time }} {{ f.title }}</template>
            <template v-else>📌 {{ f.title }}</template>
          </li>
        </ul>
      </section>

      <KneeTestCard :log="today.log" @saved="onSaved" />
      <WeightCard :log="today.log" @saved="onSaved" />

      <section class="card">
        <h2>Dagens økt</h2>
        <p class="muted small">Plan og Garmin-data (via intervals.icu) kommer i steg 4–6.</p>
      </section>

      <section v-if="today.nextRace" class="card">
        <h2>Neste løp</h2>
        <p class="race">
          <strong>{{ today.nextRace.title }}</strong>
          <span class="muted">
            {{ formatShortDate(today.nextRace.date) }} ·
            {{ today.nextRace.inDays === 0 ? 'i dag' : `om ${today.nextRace.inDays} dager` }}
          </span>
        </p>
      </section>
    </template>

    <p v-else-if="!error" class="muted">Laster …</p>
  </div>
</template>

<style scoped>
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
h1 { font-size: 24px; margin: 4px 0; }
.chip.big { font-size: 22px; padding: 6px 16px; }
.week p { margin: 8px 0 0; }
.target { font-size: 18px; }
.warn { color: var(--warn); }
.flags { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; }
.flags li { background: var(--surface-2); border-radius: 10px; padding: 8px 12px; }
.race { display: flex; justify-content: space-between; gap: 8px; margin: 0; flex-wrap: wrap; }
.connect { display: inline-flex; align-items: center; text-decoration: none; margin-top: 8px; }
.error { color: var(--bad); }
</style>
