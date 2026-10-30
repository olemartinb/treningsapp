<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeftRight, Baby, Check, Flag, TriangleAlert, X } from 'lucide-vue-next';
import { isRun, paceSecPerKm, type WeekDay } from '../api';
import { activityLabel, formatDecimal, formatPace, formatWeekdayDate } from '../format';

const props = defineProps<{ day: WeekDay; today: string }>();

const isToday = computed(() => props.day.date === props.today);
const isPast = computed(() => props.day.date < props.today);
const knee = computed(() => props.day.log?.kneeOk ?? null);
function detail(a: WeekDay['activities'][number]) {
  const parts = [a.name ?? activityLabel(a.type)];
  if (a.distanceM) parts.push(`${formatDecimal(a.distanceM / 1000)} km`);
  const pace = isRun(a) ? paceSecPerKm(a) : null;
  if (pace) parts.push(formatPace(pace));
  return parts.join(' · ');
}
</script>

<template>
  <li class="day" :class="[day.type ?? 'none', { today: isToday, past: isPast }]">
    <div class="head">
      <p class="date">
        {{ formatWeekdayDate(day.date) }}
        <span v-if="isToday" class="now">I dag</span>
      </p>
      <span class="icons">
        <span v-if="day.handover" class="tag" title="Bytte">
          <ArrowLeftRight aria-hidden="true" />{{ day.handover.time ?? 'Bytte' }}
        </span>
        <span v-if="day.kidsHomeAllDay" class="tag" title="Barna hjemme hele dagen"><Baby aria-hidden="true" />Hjemme</span>
        <span v-if="(isPast || isToday) && knee !== null" class="knee" :class="knee ? 'ok' : 'bad'" :title="knee ? 'Knetest OK' : 'Knetest ikke OK'">
          <Check v-if="knee" aria-hidden="true" /><X v-else aria-hidden="true" />
        </span>
      </span>
      <span class="km num" :class="{ zero: !day.runKm }">{{ day.runKm ? formatDecimal(day.runKm) : '' }}</span>
    </div>

    <p v-for="r in day.races" :key="r.title" class="race small"><Flag aria-hidden="true" /> {{ r.title }}</p>

    <ul v-if="day.activities.length" class="acts">
      <li v-for="a in day.activities" :key="a.id" class="small">
        <span>{{ detail(a) }}</span>
        <TriangleAlert v-if="a.kneeFlag" class="flag" :class="a.kneeFlag" aria-label="Løp uten bestått knetest" />
      </li>
    </ul>
    <p v-else-if="isPast" class="rest small">Hvile</p>
  </li>
</template>

<style scoped>
.day {
  --rail: var(--faint);
  position: relative;
  padding: 12px 14px 12px 18px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}
.day::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: var(--rail);
}
.day.barneuke { --rail: var(--barne); }
.day.eneuke { --rail: var(--ene); }
.day.today { border-color: color-mix(in oklch, var(--rail) 55%, transparent); }

.head { display: flex; align-items: center; gap: 8px; }
.date { margin: 0; font-weight: 600; }
.past .date { color: var(--muted); }
.now {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--rail);
  color: var(--on-color);
  font-size: 11px;
  font-weight: 650;
  text-transform: none;
}
.icons { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--rail) 16%, transparent);
  color: var(--rail);
  font-size: 11px;
  font-weight: 600;
}
.tag svg { width: 12px; height: 12px; }
.knee { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: var(--on-color); }
.knee svg { width: 12px; height: 12px; }
.knee.ok { background: var(--ok); }
.knee.bad { background: var(--bad); }
.km { margin-left: auto; font-size: 20px; font-weight: 650; }

.race { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; color: var(--warn); font-weight: 600; }
.race svg { width: 14px; height: 14px; }
.acts { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; color: var(--muted); }
.acts li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.acts span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flag { flex: none; width: 15px; height: 15px; }
.flag.missing { color: var(--warn); }
.flag.failed { color: var(--bad); }
.rest { margin: 4px 0 0; color: var(--faint); }
</style>
