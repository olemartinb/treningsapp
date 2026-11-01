<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Activity, Check, HeartPulse, Moon, TriangleAlert } from 'lucide-vue-next';
import { api, ApiError, type Health } from '../api';
import { formatDecimal, formatShortDate, formatSleep } from '../format';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ChartCard from '../components/charts/ChartCard.vue';
import TrendChart from '../components/charts/TrendChart.vue';

const data = ref<(Health & { configured: boolean }) | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    data.value = await api.wellness(60);
  } catch (e) {
    error.value = e instanceof ApiError ? `Feil fra serveren: ${e.message}` : 'Får ikke kontakt med serveren';
  }
});

const days = computed(() => data.value?.days ?? []);
const has = (k: 'sleepH' | 'restingHr' | 'hrv') => days.value.some((d) => d[k] !== null);
const hours = (v: number) => `${formatDecimal(v)} t`;
const whole = (v: number) => String(Math.round(v));
const latest = computed(() => data.value?.latest ?? null);

function delta(value: number | null, baseline: number | null, unit: string) {
  if (value === null || baseline === null) return null;
  const d = Math.round(value - baseline);
  return d === 0 ? 'som snittet' : `${d > 0 ? '+' : '−'}${Math.abs(d)} ${unit} mot snittet`;
}
</script>

<template>
  <div class="stack">
    <PageHeader overline="Søvn og restitusjon" title="Helse" />
    <p v-if="error" class="card error" role="alert">{{ error }}</p>

    <EmptyState
      v-if="data && !data.configured"
      :icon="HeartPulse"
      title="Koble til intervals.icu"
      text="Søvn, hvilepuls og HRV hentes fra Garmin via intervals.icu."
    />

    <template v-else-if="data">
      <!-- Dagsform -->
      <section class="card form rise" :class="data.form" style="--i: 1">
        <p class="eyebrow"><Activity aria-hidden="true" /> Dagsform</p>
        <div class="form-row">
          <span class="seal" aria-hidden="true">
            <Check v-if="data.form === 'normal'" />
            <TriangleAlert v-else-if="data.form === 'lav'" />
            <Activity v-else />
          </span>
          <div>
            <h2>
              {{ data.form === 'normal' ? 'Normal restitusjon' : data.form === 'lav' ? 'Kroppen virker sliten' : 'For lite data ennå' }}
            </h2>
            <p class="small muted">
              <template v-if="data.form === 'normal'">Hvilepuls og HRV er på ditt vanlige nivå.</template>
              <template v-else-if="data.form === 'lav'">{{ data.reasons.join(' · ') }}. Vurder en rolig økt eller hvile – ingen harde økter hvis du føler deg syk.</template>
              <template v-else>Trenger noen dager med hvilepuls eller HRV fra Garmin for å sammenligne.</template>
            </p>
          </div>
        </div>
        <p class="small faint note">Sammenlignet med ditt eget snitt de 7 dagene før. En pekepinn, ikke en diagnose.</p>
      </section>

      <!-- Søvn i natt -->
      <section class="card sleep rise" style="--i: 2">
        <p class="eyebrow"><Moon aria-hidden="true" /> Søvn</p>
        <template v-if="data.lastNight">
          <p class="hero">{{ formatSleep(data.lastNight.sleepH) }}</p>
          <p class="small muted">
            {{ data.lastNight.date === data.today ? 'I natt' : `Natt til ${formatShortDate(data.lastNight.date)}` }}
            <template v-if="data.lastNight.sleepScore !== null"> · søvnscore {{ Math.round(data.lastNight.sleepScore) }}</template>
            <template v-if="data.lastNight.sleepHr !== null"> · puls i søvn {{ Math.round(data.lastNight.sleepHr) }}</template>
            <template v-if="days.at(-1)?.sleepH7"> · snitt 7 d {{ formatSleep(days.at(-1)!.sleepH7!) }}</template>
          </p>
        </template>
        <p v-else class="small muted">
          Ingen søvndata fra intervals.icu ennå. Sjekk at velværedata (wellness) fra Garmin er slått på i intervals.icu.
        </p>
      </section>

      <!-- Nøkkeltall -->
      <div v-if="latest" class="tiles rise" style="--i: 3">
        <p class="tile">
          <span class="small muted">Hvilepuls</span>
          <strong>{{ latest.restingHr === null ? '–' : Math.round(latest.restingHr) }}</strong>
          <span class="small faint">{{ delta(latest.restingHr, latest.restingHrBaseline, 'slag') ?? 'bpm' }}</span>
        </p>
        <p class="tile">
          <span class="small muted">HRV</span>
          <strong>{{ latest.hrv === null ? '–' : Math.round(latest.hrv) }}</strong>
          <span class="small faint">{{ delta(latest.hrv, latest.hrvBaseline, 'ms') ?? 'ms' }}</span>
        </p>
        <p v-if="latest.readiness !== null" class="tile">
          <span class="small muted">Readiness</span>
          <strong>{{ Math.round(latest.readiness) }}</strong>
          <span class="small faint">fra Garmin</span>
        </p>
        <p v-if="latest.steps !== null" class="tile">
          <span class="small muted">Skritt</span>
          <strong>{{ latest.steps.toLocaleString('nb-NO') }}</strong>
          <span class="small faint">{{ formatShortDate(latest.date) }}</span>
        </p>
        <p v-if="latest.spo2 !== null" class="tile">
          <span class="small muted">SpO₂</span>
          <strong>{{ Math.round(latest.spo2) }} %</strong>
          <span class="small faint">snitt i søvn</span>
        </p>
      </div>

      <ChartCard v-if="has('sleepH')" class="rise" style="--i: 4" title="Søvn per natt" subtitle="Siste 60 dager.">
        <template #legend>
          <span class="key"><i class="swatch" style="background: var(--viz-muted); border-radius: 50%" />Natt</span>
          <span class="key"><i class="linekey" style="background: var(--viz-1)" />7-dagers snitt</span>
        </template>
        <TrendChart
          :dates="days.map((d) => d.date)"
          :series="[
            { label: 'Natt', color: 'var(--viz-muted)', kind: 'dots', values: days.map((d) => d.sleepH) },
            { label: '7-dagers snitt', color: 'var(--viz-1)', kind: 'line', values: days.map((d) => d.sleepH7), endLabel: true },
          ]"
          :format="hours"
          label="Søvn per natt med 7-dagers snitt"
        />
        <template #table>
          <table>
            <thead><tr><th>Natt til</th><th>Søvn</th><th>Score</th></tr></thead>
            <tbody>
              <tr v-for="d in [...days].reverse().filter((d) => d.sleepH !== null)" :key="d.date">
                <td>{{ formatShortDate(d.date) }}</td><td>{{ formatSleep(d.sleepH!) }}</td><td>{{ d.sleepScore ?? '–' }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard v-if="has('restingHr')" class="rise" style="--i: 5" title="Hvilepuls" subtitle="Lavere over tid betyr som regel bedre form. En brå økning kan bety sykdom eller lite søvn.">
        <template #legend>
          <span class="key"><i class="swatch" style="background: var(--viz-muted); border-radius: 50%" />Dag</span>
          <span class="key"><i class="linekey" style="background: var(--viz-1)" />7-dagers snitt</span>
        </template>
        <TrendChart
          :dates="days.map((d) => d.date)"
          :series="[
            { label: 'Dag', color: 'var(--viz-muted)', kind: 'dots', values: days.map((d) => d.restingHr) },
            { label: '7-dagers snitt', color: 'var(--viz-1)', kind: 'line', values: days.map((d) => d.restingHr7), endLabel: true },
          ]"
          :format="whole"
          label="Hvilepuls per dag med 7-dagers snitt"
        />
        <template #table>
          <table>
            <thead><tr><th>Dato</th><th>Hvilepuls</th><th>Snitt 7 d</th></tr></thead>
            <tbody>
              <tr v-for="d in [...days].reverse().filter((d) => d.restingHr !== null)" :key="d.date">
                <td>{{ formatShortDate(d.date) }}</td><td>{{ d.restingHr }}</td><td>{{ d.restingHr7 === null ? '–' : whole(d.restingHr7) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard v-if="has('hrv')" class="rise" style="--i: 6" title="HRV" subtitle="Hjertevariasjon i søvn (ms). Høyere enn snittet betyr som regel god restitusjon.">
        <template #legend>
          <span class="key"><i class="swatch" style="background: var(--viz-muted); border-radius: 50%" />Natt</span>
          <span class="key"><i class="linekey" style="background: var(--viz-1)" />7-dagers snitt</span>
        </template>
        <TrendChart
          :dates="days.map((d) => d.date)"
          :series="[
            { label: 'Natt', color: 'var(--viz-muted)', kind: 'dots', values: days.map((d) => d.hrv) },
            { label: '7-dagers snitt', color: 'var(--viz-1)', kind: 'line', values: days.map((d) => d.hrv7), endLabel: true },
          ]"
          :format="whole"
          label="HRV per natt med 7-dagers snitt"
        />
        <template #table>
          <table>
            <thead><tr><th>Dato</th><th>HRV</th><th>Snitt 7 d</th></tr></thead>
            <tbody>
              <tr v-for="d in [...days].reverse().filter((d) => d.hrv !== null)" :key="d.date">
                <td>{{ formatShortDate(d.date) }}</td><td>{{ d.hrv }}</td><td>{{ d.hrv7 === null ? '–' : whole(d.hrv7) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>
    </template>
  </div>
</template>

<style scoped>
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.error { color: var(--bad); }
h2 { margin: 0 0 2px; font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
p { margin: 0; }
.faint { color: var(--faint); }
.form-row { display: flex; gap: 14px; align-items: center; }
.seal { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; color: #fff; background: var(--surface-3); }
.seal svg { width: 24px; height: 24px; }
.form.normal .seal { background: var(--status-good); }
.form.lav .seal { background: var(--status-critical); }
.form.lav { border-color: color-mix(in oklch, var(--status-critical) 40%, transparent); }
.note { margin-top: 12px; }
.hero { font-size: 44px; font-weight: 650; line-height: 1.05; letter-spacing: -0.04em; margin: 2px 0 4px; }
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tile {
  display: grid;
  gap: 2px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
}
.tile strong { font-size: 30px; font-weight: 650; letter-spacing: -0.03em; }
</style>
