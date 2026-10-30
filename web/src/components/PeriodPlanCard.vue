<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowLeftRight, Baby, Flag, Plus, Sparkles, User } from 'lucide-vue-next';
import { api, ApiError, type PlanPeriod, type PlannedSession } from '../api';
import { WEEK_LABEL, dayBefore, formatDecimal, formatKm, formatShortDate, formatWeekdayDate } from '../format';
import SessionChip from './SessionChip.vue';

const props = defineProps<{ period: PlanPeriod; today: string }>();
const emit = defineEmits<{ edit: [session: PlannedSession]; add: [date: string]; changed: [] }>();

const BASE_KM = { barneuke: '25–35', eneuke: '60–68' } as const;
const filling = ref(false);
/** Past days are only shown when something was planned on them. */
const visibleDates = computed(() => props.period.dates.filter((d) => d.date >= props.today || d.sessions.length));
const error = ref<string | null>(null);

async function fill() {
  filling.value = true;
  error.value = null;
  try {
    await api.fillPeriod(props.period.start);
    emit('changed');
  } catch (e) {
    error.value = e instanceof ApiError ? `Kunne ikke fylle ut: ${e.message}` : 'Kunne ikke fylle ut';
  } finally {
    filling.value = false;
  }
}
</script>

<template>
  <section class="card period" :class="period.type">
    <header>
      <span class="type">
        <Baby v-if="period.type === 'barneuke'" aria-hidden="true" />
        <User v-else aria-hidden="true" />
        {{ WEEK_LABEL[period.type] }}
      </span>
      <span class="small muted">
        {{ formatShortDate(period.start) }} – {{ formatShortDate(dayBefore(period.end)) }} · {{ period.days }} d
      </span>
    </header>

    <div class="numbers">
      <p>
        <span class="small muted">Mål</span>
        <strong class="num">{{ formatKm(period.target.min) }}–{{ formatKm(period.target.max) }} km</strong>
      </p>
      <p :class="['planned', period.plannedStatus]">
        <span class="small muted">{{ period.doneKm ? 'Løpt + planlagt' : 'Planlagt' }}</span>
        <strong class="num">{{ formatKm(period.projectedKm) }} km</strong>
      </p>
    </div>
    <p v-if="period.doneKm" class="split small muted">
      {{ formatDecimal(period.doneKm) }} km løpt hittil · {{ formatDecimal(period.plannedKm) }} km planlagt videre
    </p>
    <p v-if="period.target.scaled" class="note small">
      {{ period.days < 7 ? 'Kort' : 'Lang' }} periode · skalert fra {{ BASE_KM[period.type] }} km/uke
    </p>
    <p v-if="period.plannedStatus === 'over'" class="over small">
      Planen ender over målet. Ekstra km er ikke en seier – kutt en rolig tur.
    </p>

    <ol class="days">
      <li v-for="d in visibleDates" :key="d.date" :class="{ past: d.date < today, today: d.date === today }">
        <div class="day-head">
          <span class="date small">{{ formatWeekdayDate(d.date) }}</span>
          <ArrowLeftRight v-if="d.handover" class="mini" aria-label="Bytte" />
          <Baby v-if="d.kidsHomeAllDay" class="mini" aria-label="Barna hjemme hele dagen" />
          <span v-for="r in d.races" :key="r.title" class="race small"><Flag aria-hidden="true" />{{ r.title }}</span>
          <span v-if="d.date < today && d.doneKm" class="done-km small num">{{ formatDecimal(d.doneKm) }} km løpt</span>
          <button v-if="d.date >= today" class="add" :aria-label="`Legg til økt ${formatWeekdayDate(d.date)}`" @click="emit('add', d.date)">
            <Plus aria-hidden="true" />
          </button>
        </div>
        <div v-if="d.sessions.length" class="sessions">
          <SessionChip v-for="s in d.sessions" :key="s.id" :session="s" @open="emit('edit', s)" />
        </div>
      </li>
    </ol>

    <button v-if="period.canFill" class="btn fill" :disabled="filling" @click="fill">
      <Sparkles aria-hidden="true" /> {{ filling ? 'Fyller ut …' : 'Fyll ut fra mal' }}
    </button>
    <p v-if="error" class="error small" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.period { --week: var(--accent); border-color: color-mix(in oklch, var(--week) 22%, var(--border)); }
.period.barneuke { --week: var(--barne); }
.period.eneuke { --week: var(--ene); }
.period {
  background:
    radial-gradient(120% 60% at 0% 0%, color-mix(in oklch, var(--week) 18%, transparent), transparent 60%),
    var(--surface);
}
header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 10px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--week) 18%, transparent);
  color: var(--week);
  font-weight: 650;
}
.type svg { width: 16px; height: 16px; }
.numbers { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.numbers p { display: grid; margin: 0; }
.numbers strong { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
.planned.in-range strong { color: var(--ok); }
.planned.over strong { color: var(--bad); }
.note { margin: 8px 0 0; color: var(--warn); }
.split { margin: 6px 0 0; }
.over { margin: 8px 0 0; color: var(--bad); font-weight: 550; }

.days { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 4px; }
.days li { padding: 8px 0; border-top: 1px solid var(--border); }
.days li.past { opacity: 0.55; }
.day-head { display: flex; align-items: center; gap: 6px; min-height: 32px; }
.date { font-weight: 600; }
.today .date { color: var(--week); }
.mini { width: 14px; height: 14px; color: var(--week); }
.race { display: inline-flex; align-items: center; gap: 4px; color: var(--bad); font-weight: 600; }
.race svg { width: 13px; height: 13px; }
.done-km { margin-left: auto; color: var(--muted); }
.add {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-left: auto;
  border-radius: 999px;
  border: 1px dashed var(--border);
  background: none;
  color: var(--muted);
}
.add svg { width: 16px; height: 16px; }
.sessions { display: grid; gap: 6px; margin-top: 4px; }
.fill { width: 100%; margin-top: 14px; }
.error { color: var(--bad); margin: 8px 0 0; }
</style>
