<script setup lang="ts">
import { Activity as ActivityIcon, Bike, Dumbbell, Footprints, HeartPulse, TriangleAlert } from 'lucide-vue-next';
import { isRun, paceSecPerKm, type Activity, type KneeFlag } from '../api';
import { activityLabel, formatDistance, formatDuration, formatPace } from '../format';

defineProps<{ activities: (Activity & { kneeFlag: KneeFlag | null })[] }>();

const icon = (type: string) =>
  isRun({ type }) ? Footprints : type.endsWith('Ride') ? Bike : type === 'WeightTraining' ? Dumbbell : ActivityIcon;
function pace(a: Activity) {
  const sec = isRun(a) ? paceSecPerKm(a) : null;
  return sec === null ? null : formatPace(sec);
}
</script>

<template>
  <ul class="list">
    <li v-for="a in activities" :key="a.id" :class="{ flagged: a.kneeFlag }">
      <div class="row">
        <span class="badge"><component :is="icon(a.type)" aria-hidden="true" /></span>
        <div class="body">
          <p class="title">{{ a.name ?? activityLabel(a.type) }}</p>
          <p class="meta small">
            <span v-if="a.name && a.name !== activityLabel(a.type)">{{ activityLabel(a.type) }}</span>
            <span v-if="a.distanceM" class="num">{{ formatDistance(a.distanceM) }}</span>
            <span v-if="a.movingS" class="num">{{ formatDuration(a.movingS) }}</span>
            <span v-if="pace(a)" class="num">{{ pace(a) }}</span>
            <span v-if="a.avgHr" class="num hr"><HeartPulse aria-hidden="true" />{{ Math.round(a.avgHr) }}</span>
          </p>
        </div>
      </div>
      <p v-if="a.kneeFlag" class="flag small" :class="a.kneeFlag">
        <TriangleAlert aria-hidden="true" />
        {{ a.kneeFlag === 'failed' ? 'Løp selv om knetesten ikke var smertefri' : 'Løp uten bestått knetest i dag' }}
      </p>
    </li>
  </ul>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
li { padding: 12px; border-radius: var(--radius-sm); background: color-mix(in oklch, var(--surface-2) 80%, transparent); }
.row { display: flex; gap: 12px; align-items: center; }
.badge {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: color-mix(in oklch, var(--week) 16%, transparent);
  color: var(--week);
}
.badge svg { width: 20px; height: 20px; }
.body { min-width: 0; }
.title { margin: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { margin: 2px 0 0; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 10px; }
.hr { display: inline-flex; align-items: center; gap: 3px; }
.hr svg { width: 13px; height: 13px; color: var(--bad); }
.flag { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; font-weight: 550; }
.flag svg { width: 16px; height: 16px; flex: none; }
.flag.missing { color: var(--warn); }
.flag.failed { color: var(--bad); }
.flagged { box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--warn) 40%, transparent); }
</style>
