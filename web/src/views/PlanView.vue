<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { CalendarDays } from 'lucide-vue-next';
import { api, ApiError, type PlanPeriod, type PlannedSession } from '../api';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import PeriodPlanCard from '../components/PeriodPlanCard.vue';
import SessionSheet from '../components/SessionSheet.vue';

const periods = ref<PlanPeriod[] | null>(null);
const today = ref('');
const error = ref<string | null>(null);
const needsCalendar = ref(false);
const editing = ref<PlannedSession | null>(null);
const adding = ref<string | null>(null);

async function load() {
  try {
    const plan = await api.plan(8);
    periods.value = plan.periods;
    today.value = plan.today;
    error.value = null;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'google_not_connected') needsCalendar.value = true;
    else error.value = e instanceof ApiError ? `Feil fra serveren: ${e.message}` : 'Får ikke kontakt med serveren';
  }
}

function closeSheet() {
  editing.value = null;
  adding.value = null;
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <PageHeader overline="Neste 8 uker" title="Plan" />

    <EmptyState
      v-if="needsCalendar"
      :icon="CalendarDays"
      title="Koble til kalenderen"
      text="Planen bygger på barneuker og eneuker fra Google Kalender. Koble til på I dag-siden."
    />
    <p v-else-if="error" class="card error" role="alert">{{ error }}</p>
    <p v-else-if="periods && !periods.length" class="card muted">Ingen barneuker eller eneuker i kalenderen de neste 8 ukene.</p>

    <PeriodPlanCard
      v-for="(p, i) in periods ?? []"
      :key="p.start"
      class="rise"
      :style="{ '--i': Math.min(i, 4) }"
      :period="p"
      :today="today"
      @edit="editing = $event"
      @add="adding = $event"
      @changed="load"
    />

    <SessionSheet :session="editing" :date="adding" @close="closeSheet" @changed="load" />
  </div>
</template>

<style scoped>
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.error { color: var(--bad); }
</style>
