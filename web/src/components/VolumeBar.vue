<script setup lang="ts">
import { computed } from 'vue';
import type { PeriodVolume } from '../api';
import { formatKm } from '../format';

const props = defineProps<{ volume: PeriodVolume; target: { min: number; max: number } }>();

// Scale leaves room past the target band so "over" is visible.
const scaleMax = computed(() => Math.max(props.target.max * 1.15, props.volume.km));
const pct = (km: number) => `${Math.min(100, (km / scaleMax.value) * 100)}%`;
const remaining = computed(() => ({
  min: Math.max(0, Math.round((props.target.min - props.volume.km) * 10) / 10),
  max: Math.round((props.target.max - props.volume.km) * 10) / 10,
}));
const over = computed(() => Math.round((props.volume.km - props.target.max) * 10) / 10);
</script>

<template>
  <div class="volume" :class="volume.status">
    <div class="track" role="img" :aria-label="`${formatKm(volume.km)} av ${formatKm(target.min)}–${formatKm(target.max)} km`">
      <span class="band" :style="{ left: pct(target.min), width: `calc(${pct(target.max)} - ${pct(target.min)})` }" />
      <span class="fill" :style="{ width: pct(volume.km) }" />
    </div>
    <p class="small status">
      <template v-if="volume.status === 'over'">Over planen med {{ formatKm(over) }} km. Ekstra km er ikke en seier.</template>
      <template v-else-if="volume.status === 'in-range'">Innenfor målet · maks {{ formatKm(remaining.max) }} km til</template>
      <template v-else>{{ formatKm(remaining.min) }}–{{ formatKm(remaining.max) }} km igjen</template>
    </p>
  </div>
</template>

<style scoped>
.volume { margin: 14px 0 18px; }
.track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--surface-3) 70%, transparent);
  overflow: hidden;
}
.band {
  position: absolute;
  inset-block: 0;
  background: color-mix(in oklch, var(--week) 28%, transparent);
}
.fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: inherit;
  background: var(--week);
  transition: width 0.7s var(--ease);
}
.over .fill { background: var(--bad); }
.in-range .fill { background: var(--ok); }
.status { margin: 8px 0 0; color: var(--muted); }
.over .status { color: var(--bad); font-weight: 550; }
.in-range .status { color: var(--ok); }
</style>
