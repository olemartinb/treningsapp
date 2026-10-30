<script setup lang="ts">
import { ArrowLeftRight } from 'lucide-vue-next';
import type { DayInfo } from '../api';
import { formatDecimal, weekdayLetter } from '../format';

defineProps<{ days: DayInfo[]; today: string; kmByDate?: Record<string, number> }>();
</script>

<template>
  <ol class="strip" :style="{ '--n': days.length }">
    <li
      v-for="d in days"
      :key="d.date"
      :class="{ today: d.date === today, past: d.date < today }"
      :aria-label="`${d.date}${d.handover ? ', bytte' : ''}${d.kidsHomeAllDay ? ', barna hjemme hele dagen' : ''}`"
      :aria-current="d.date === today ? 'date' : undefined"
    >
      <span class="wd">{{ weekdayLetter(d.date) }}</span>
      <span class="dn num">{{ Number(d.date.slice(8)) }}</span>
      <span class="km num">{{ kmByDate?.[d.date] ? formatDecimal(kmByDate[d.date]!) : '' }}</span>
      <span class="mark">
        <ArrowLeftRight v-if="d.handover" aria-hidden="true" />
        <i v-else-if="d.kidsHomeAllDay" class="dot" />
      </span>
    </li>
  </ol>
</template>

<style scoped>
.strip {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(0, 1fr));
  gap: 4px;
}
li {
  justify-self: center;
  width: 100%;
  max-width: 48px;
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 8px 0 6px;
  border-radius: 999px;
  transition: background-color 0.2s;
}
.wd { font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; }
.dn { font-size: 15px; font-weight: 600; }
.past .dn { color: var(--muted); }
.km { min-height: 13px; font-size: 10.5px; font-weight: 600; color: var(--week); line-height: 1.2; }
.today .km { color: var(--on-color); }
.today { background: var(--week); color: var(--on-color); }
.today .wd { color: color-mix(in oklch, var(--on-color) 65%, transparent); }
.today .dn { color: var(--on-color); }
.mark { height: 12px; display: grid; place-items: center; color: var(--week); }
.today .mark { color: var(--on-color); }
.mark svg { width: 12px; height: 12px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
.today .dot { background: var(--on-color); }
</style>
