<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError, type Progress } from '../api';
import { WEEK_LABEL, formatDecimal, formatKm, formatPace, formatShortDate } from '../format';
import PageHeader from '../components/PageHeader.vue';
import ChartCard from '../components/charts/ChartCard.vue';
import TrendChart from '../components/charts/TrendChart.vue';
import WeeklyKmChart from '../components/charts/WeeklyKmChart.vue';
import KneeGrid from '../components/charts/KneeGrid.vue';

const GOAL_PACE = 227; // 3:47/km – sub 1:20 half marathon
const GOAL_KG = 68;

const data = ref<Progress | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    data.value = await api.progress(26);
  } catch (e) {
    error.value = e instanceof ApiError ? `Feil fra serveren: ${e.message}` : 'Får ikke kontakt med serveren';
  }
});

const pace = (s: number) => formatPace(s).replace('/km', '');
const kg = (v: number) => formatDecimal(v);
const whole = (v: number) => String(Math.round(v));

const weeklyEmpty = computed(() => (data.value && !data.value.weekly.some((w) => w.km > 0) ? 'Ingen løpeturer i perioden ennå.' : null));
const latestFitness = computed(() => data.value?.fitness.at(-1) ?? null);
const kneeTested = computed(() => data.value?.knee.filter((d) => d.ok !== null).length ?? 0);
const kneeFailed = computed(() => data.value?.knee.filter((d) => d.ok === false).length ?? 0);
const latestWeight = computed(() => data.value?.weight.findLast((w) => w.avg7 !== null) ?? null);
</script>

<template>
  <div class="stack">
    <PageHeader overline="Siste 6 måneder" title="Fremgang" />
    <p v-if="error" class="card error" role="alert">{{ error }}</p>

    <template v-if="data">
      <ChartCard class="rise" style="--i: 1" title="Km per uke" subtitle="Løpte km mot målområdet for uka (blandet per dag i byttuker)." :empty="weeklyEmpty">
        <template #legend>
          <span class="key"><i class="swatch" style="background: var(--viz-barne)" />Barneuke</span>
          <span class="key"><i class="swatch" style="background: var(--viz-ene)" />Eneuke</span>
          <span class="key"><i class="swatch" style="background: var(--viz-band)" />Målområde</span>
        </template>
        <WeeklyKmChart :weeks="data.weekly" />
        <template #table>
          <table>
            <thead><tr><th>Uke</th><th>Type</th><th>Km</th><th>Mål</th></tr></thead>
            <tbody>
              <tr v-for="w in [...data.weekly].reverse()" :key="w.start">
                <td>{{ w.weekNo }} ({{ formatShortDate(w.start) }})</td>
                <td>{{ w.type ? WEEK_LABEL[w.type] : '–' }}</td>
                <td>{{ formatKm(w.km) }}</td>
                <td>{{ w.target ? `${formatKm(w.target.min)}–${formatKm(w.target.max)}` : '–' }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard
        class="rise"
        style="--i: 2"
        title="Terskeltempo"
        subtitle="Snittempo for hele terskeløkta mot målfarten 3:47/km (sub 1:20 halvmaraton). Raskere er høyere."
        :empty="data.threshold.length ? null : 'Ingen terskeløkter ennå. Økter planlagt som terskel, eller med «terskel» eller «3x4 km» i navnet, havner her.'"
      >
        <TrendChart
          :dates="data.threshold.map((t) => t.date)"
          :series="[{ label: 'Terskeløkt', color: 'var(--viz-1)', kind: 'dots', values: data.threshold.map((t) => t.paceSec) }]"
          :format="pace"
          invert
          :reference="{ value: GOAL_PACE, label: 'Mål 3:47' }"
          label="Terskeltempo over tid mot målfarten 3:47 per km"
        />
        <template #table>
          <table>
            <thead><tr><th>Dato</th><th>Økt</th><th>Km</th><th>Tempo</th></tr></thead>
            <tbody>
              <tr v-for="t in [...data.threshold].reverse()" :key="t.date + t.km">
                <td>{{ formatShortDate(t.date) }}</td><td>{{ t.name ?? '–' }}</td><td>{{ formatDecimal(t.km) }}</td><td>{{ formatPace(t.paceSec) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard
        class="rise"
        style="--i: 3"
        title="Aerob effektivitet"
        subtitle="Tempo på rolige turer omregnet til 140 i puls. Raskere (høyere) betyr bedre form."
        :empty="data.efficiency.length ? null : 'Ingen rolige turer med puls ennå (minst 4 km, snittpuls under 150).'"
      >
        <template #legend>
          <span class="key"><i class="swatch" style="background: var(--viz-muted); border-radius: 50%" />Enkeltøkt</span>
          <span class="key"><i class="linekey" style="background: var(--viz-1)" />Snitt siste 8</span>
        </template>
        <TrendChart
          :dates="data.efficiency.map((e) => e.date)"
          :series="[
            { label: 'Økt', color: 'var(--viz-muted)', kind: 'dots', values: data.efficiency.map((e) => e.paceAtRefHr) },
            { label: 'Snitt siste 8', color: 'var(--viz-1)', kind: 'line', values: data.efficiency.map((e) => e.trend), endLabel: true },
          ]"
          :format="pace"
          invert
          label="Tempo ved 140 i puls på rolige turer over tid"
        />
        <template #table>
          <table>
            <thead><tr><th>Dato</th><th>Km</th><th>Puls</th><th>Tempo</th><th>Ved 140</th></tr></thead>
            <tbody>
              <tr v-for="e in [...data.efficiency].reverse()" :key="e.date + e.km">
                <td>{{ formatShortDate(e.date) }}</td><td>{{ formatDecimal(e.km) }}</td><td>{{ e.avgHr }}</td>
                <td>{{ formatPace(e.paceSec) }}</td><td>{{ formatPace(e.paceAtRefHr) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard
        class="rise"
        style="--i: 4"
        title="Vekt"
        :subtitle="latestWeight ? `7-dagers snitt ${kg(latestWeight.avg7!)} kg · ${kg(Math.max(0, latestWeight.avg7! - GOAL_KG))} kg igjen til ${GOAL_KG} kg` : undefined"
        :empty="data.weight.length ? null : 'Ingen vekt registrert ennå. Legg inn fastende vekt på I dag-siden.'"
      >
        <template #legend>
          <span class="key"><i class="swatch" style="background: var(--viz-muted); border-radius: 50%" />Daglig</span>
          <span class="key"><i class="linekey" style="background: var(--viz-1)" />7-dagers snitt</span>
        </template>
        <TrendChart
          :dates="data.weight.map((w) => w.date)"
          :series="[
            { label: 'Daglig', color: 'var(--viz-muted)', kind: 'dots', values: data.weight.map((w) => w.kg) },
            { label: '7-dagers snitt', color: 'var(--viz-1)', kind: 'line', values: data.weight.map((w) => w.avg7), endLabel: true },
          ]"
          :format="kg"
          :reference="{ value: GOAL_KG, label: `Mål ${GOAL_KG} kg` }"
          label="Vekt over tid med 7-dagers snitt mot målet 68 kg"
        />
        <template #table>
          <table>
            <thead><tr><th>Dato</th><th>Vekt</th><th>Snitt 7 d</th></tr></thead>
            <tbody>
              <tr v-for="w in [...data.weight].reverse().filter((w) => w.kg !== null)" :key="w.date">
                <td>{{ formatShortDate(w.date) }}</td><td>{{ kg(w.kg!) }}</td><td>{{ w.avg7 === null ? '–' : kg(w.avg7) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard
        class="rise"
        style="--i: 5"
        title="Form"
        subtitle="Fra intervals.icu. Form (TSB) = fitness (CTL) − tretthet (ATL)."
        :empty="data.fitness.length ? null : 'Ingen form-data fra intervals.icu ennå.'"
      >
        <div v-if="latestFitness" class="tiles">
          <p><span class="small muted">Fitness</span><strong>{{ whole(latestFitness.ctl) }}</strong></p>
          <p><span class="small muted">Tretthet</span><strong>{{ whole(latestFitness.atl) }}</strong></p>
          <p><span class="small muted">Form</span><strong>{{ latestFitness.tsb > 0 ? '+' : '' }}{{ whole(latestFitness.tsb) }}</strong></p>
        </div>
        <div class="legend-row small">
          <span class="key"><i class="linekey" style="background: var(--viz-1)" />Fitness (CTL)</span>
          <span class="key"><i class="linekey" style="background: var(--viz-atl)" />Tretthet (ATL)</span>
        </div>
        <TrendChart
          :dates="data.fitness.map((f) => f.date)"
          :series="[
            { label: 'Fitness', color: 'var(--viz-1)', kind: 'line', values: data.fitness.map((f) => f.ctl), endLabel: true },
            { label: 'Tretthet', color: 'var(--viz-atl)', kind: 'line', values: data.fitness.map((f) => f.atl), endLabel: true },
          ]"
          :format="whole"
          label="Fitness og tretthet over tid"
        />
        <template #table>
          <table>
            <thead><tr><th>Dato</th><th>CTL</th><th>ATL</th><th>TSB</th></tr></thead>
            <tbody>
              <tr v-for="f in [...data.fitness].reverse()" :key="f.date">
                <td>{{ formatShortDate(f.date) }}</td><td>{{ whole(f.ctl) }}</td><td>{{ whole(f.atl) }}</td><td>{{ whole(f.tsb) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </ChartCard>

      <ChartCard class="rise" style="--i: 6" title="Knetest" subtitle="Siste 8 uker.">
        <div class="streak">
          <strong>{{ data.kneeStreak }}</strong>
          <span>{{ data.kneeStreak === 1 ? 'dag' : 'dager' }} smertefri på rad</span>
        </div>
        <p class="small muted counts">{{ kneeTested }} av {{ data.knee.length }} dager testet · {{ kneeFailed }} ikke smertefri</p>
        <KneeGrid :days="data.knee" />
      </ChartCard>
    </template>
  </div>
</template>

<style scoped>
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.error { color: var(--bad); }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 12px; }
.tiles p { display: grid; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); }
.tiles strong { font-size: 26px; font-weight: 650; letter-spacing: -0.03em; }
.legend-row { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 10px; color: var(--muted); }
.legend-row .key { display: inline-flex; align-items: center; gap: 6px; }
.legend-row .linekey { width: 14px; height: 2px; border-radius: 1px; }
.streak { display: flex; align-items: baseline; gap: 10px; }
.streak strong { font-size: 52px; font-weight: 650; line-height: 1; letter-spacing: -0.04em; color: var(--text); }
.counts { margin: 4px 0 14px; }
</style>
