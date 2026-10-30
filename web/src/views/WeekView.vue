<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { api, ApiError, type Week } from '../api';
import { addDays, mondayOf, todayOslo } from '../dates';
import { formatKm, formatShortDate } from '../format';
import PageHeader from '../components/PageHeader.vue';
import DayCard from '../components/DayCard.vue';
import VolumeBar from '../components/VolumeBar.vue';

const route = useRoute();
const router = useRouter();

const today = todayOslo();
const start = computed(() => mondayOf(typeof route.query.start === 'string' ? route.query.start : today));
const isCurrent = computed(() => start.value === mondayOf(today));

const week = ref<Week | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    week.value = await api.week(start.value);
    error.value = null;
  } catch (e) {
    error.value = e instanceof ApiError ? `Feil fra serveren: ${e.message}` : 'Får ikke kontakt med serveren';
  } finally {
    loading.value = false;
  }
}

function go(weeks: number) {
  const next = addDays(start.value, weeks * 7);
  void router.replace({ query: next === mondayOf(today) ? {} : { start: next } });
}

// Mixed weeks get a neutral tint; single-type weeks take the week colour.
const tint = computed(() => {
  const mix = week.value?.mix;
  if (!mix) return 'var(--accent)';
  if (mix.barneuke && !mix.eneuke) return 'var(--barne)';
  if (mix.eneuke && !mix.barneuke) return 'var(--ene)';
  return 'var(--accent)';
});

watch(start, load, { immediate: true });
</script>

<template>
  <div class="stack">
    <PageHeader
      :overline="week ? `${formatShortDate(week.start)} – ${formatShortDate(week.end)}` : ' '"
      :title="week ? `Uke ${week.weekNo}` : 'Uke'"
    />

    <nav class="nav rise" aria-label="Bla mellom uker">
      <button class="icon-btn" aria-label="Forrige uke" @click="go(-1)"><ChevronLeft /></button>
      <button class="btn ghost" :disabled="isCurrent" @click="router.replace({ query: {} })">Denne uka</button>
      <button class="icon-btn" aria-label="Neste uke" @click="go(1)"><ChevronRight /></button>
    </nav>

    <p v-if="error" class="card error" role="alert">{{ error }}</p>

    <template v-if="week">
      <section class="card summary rise" :class="{ loading }" :style="{ '--week': tint }" style="--i: 1">
        <p class="km">
          <span class="num">{{ formatKm(week.runKm) }}</span>
          <span class="unit">{{ week.target ? `av ${formatKm(week.target.min)}–${formatKm(week.target.max)} km løpt` : 'km løpt' }}</span>
        </p>
        <VolumeBar v-if="week.target && week.status" :volume="{ km: week.runKm, status: week.status, kmByDate: {} }" :target="week.target" />
        <p v-if="week.mix.barneuke || week.mix.eneuke" class="mix small">
          <span v-if="week.mix.barneuke" class="chip-sm barne">{{ week.mix.barneuke }} d barneuke</span>
          <span v-if="week.mix.eneuke" class="chip-sm ene">{{ week.mix.eneuke }} d eneuke</span>
          <span v-if="week.mix.barneuke && week.mix.eneuke" class="muted">mål blandet per dag</span>
        </p>
      </section>

      <ol class="days rise" :class="{ loading }" style="--i: 2">
        <DayCard v-for="d in week.days" :key="d.date" :day="d" :today="today" />
      </ol>
    </template>
  </div>
</template>

<style scoped>
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.nav { display: flex; justify-content: space-between; align-items: center; margin-top: -8px; }
.summary {
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in oklch, var(--week) 24%, transparent), transparent 62%),
    var(--surface);
}
.km { display: flex; align-items: baseline; gap: 8px; margin: 0; flex-wrap: wrap; }
.km .num { font-size: 52px; font-weight: 600; line-height: 1; letter-spacing: -0.05em; }
.km .unit { color: var(--muted); font-weight: 550; }
.mix { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0; }
.chip-sm { padding: 2px 10px; border-radius: 999px; font-weight: 600; }
.chip-sm.barne { background: color-mix(in oklch, var(--barne) 18%, transparent); color: var(--barne); }
.chip-sm.ene { background: color-mix(in oklch, var(--ene) 18%, transparent); color: var(--ene); }
.days { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.loading { opacity: 0.6; transition: opacity 0.2s; }
.error { color: var(--bad); }
</style>
