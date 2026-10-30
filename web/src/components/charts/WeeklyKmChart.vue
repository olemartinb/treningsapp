<script setup lang="ts">
// Weekly run km as columns coloured by week type, over the week's target band.
import { computed, ref } from 'vue';
import type { Progress } from '../../api';
import { useElementWidth } from '../../composables';
import { columnPath, linear, niceTicks } from '../../chart';
import { WEEK_LABEL, formatKm } from '../../format';

const props = defineProps<{ weeks: Progress['weekly'] }>();

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 32 };
const root = ref<HTMLElement | null>(null);
const width = useElementWidth(root);

const slot = computed(() => (width.value - PAD.left - PAD.right) / Math.max(1, props.weeks.length));
const barW = computed(() => Math.max(3, Math.min(24, slot.value - 2)));
const maxY = computed(() => Math.max(10, ...props.weeks.map((w) => Math.max(w.km, w.target?.max ?? 0))) * 1.05);
const y = computed(() => linear(0, maxY.value, HEIGHT - PAD.bottom, PAD.top));
const ticks = computed(() => niceTicks(0, maxY.value, 3));
const x = (i: number) => PAD.left + i * slot.value + (slot.value - barW.value) / 2;
const color = (w: Progress['weekly'][number]) => (w.type === 'barneuke' ? 'var(--viz-barne)' : w.type === 'eneuke' ? 'var(--viz-ene)' : 'var(--viz-muted)');
const labelEvery = computed(() => Math.ceil(28 / slot.value));
/** Week numbers to label: counted back from the latest week, so it is always labelled. */
const labelled = computed(() => {
  const set = new Set<number>();
  for (let i = props.weeks.length - 1; i >= 0; i -= labelEvery.value) set.add(i);
  return set;
});

const active = ref<number | null>(null);
const tip = computed(() => {
  const i = active.value;
  if (i === null) return null;
  const w = props.weeks[i]!;
  return { w, x: x(i) + barW.value / 2, left: x(i) > width.value / 2 };
});
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const last = props.weeks.length - 1;
  active.value = Math.max(0, Math.min(last, (active.value ?? last) + (e.key === 'ArrowLeft' ? -1 : 1)));
}
</script>

<template>
  <div ref="root" class="chart" :style="{ height: `${HEIGHT}px` }">
    <svg
      v-if="width"
      :width="width"
      :height="HEIGHT"
      tabindex="0"
      role="img"
      aria-label="Løpte km per uke mot målområdet, farget etter uketype"
      @keydown="onKey"
      @blur="active = null"
      @pointerleave="active = null"
    >
      <g class="grid">
        <template v-for="t in ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" />
          <text class="tick tnum" :x="PAD.left - 6" :y="y(t)" dy="0.32em" text-anchor="end">{{ t }}</text>
        </template>
      </g>
      <g v-for="(w, i) in weeks" :key="w.start" @pointerenter="active = i">
        <!-- Hit area: the whole slot, bigger than the mark. -->
        <rect class="hit" :x="PAD.left + i * slot" :y="PAD.top" :width="slot" :height="HEIGHT - PAD.top - PAD.bottom" />
        <rect
          v-if="w.target && w.target.max > 0"
          class="band"
          :x="PAD.left + i * slot + 1"
          :width="slot - 2"
          :y="y(w.target.max)"
          :height="Math.max(1, y(w.target.min) - y(w.target.max))"
          rx="2"
        />
        <path :d="columnPath(x(i), barW, y(w.km), y(0))" :style="{ fill: color(w) }" :class="{ dim: active !== null && active !== i }" />
        <text v-if="labelled.has(i)" class="tick tnum" :x="x(i) + barW / 2" :y="HEIGHT - 6" text-anchor="middle">
          {{ w.weekNo }}
        </text>
      </g>
      <line class="baseline" :x1="PAD.left" :x2="width - PAD.right" :y1="y(0)" :y2="y(0)" />
    </svg>

    <div v-if="tip" class="tooltip" :class="{ left: tip.left }" :style="{ left: `${tip.x}px` }" role="status">
      <p class="tip-date">Uke {{ tip.w.weekNo }}<template v-if="tip.w.type"> · {{ WEEK_LABEL[tip.w.type] }}</template></p>
      <p class="tip-row"><strong class="tnum">{{ formatKm(tip.w.km) }} km</strong></p>
      <p v-if="tip.w.target" class="tip-row muted">mål {{ formatKm(tip.w.target.min) }}–{{ formatKm(tip.w.target.max) }} km</p>
    </div>
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; }
svg { display: block; overflow: visible; outline: none; }
svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
.grid line { stroke: var(--viz-grid); stroke-width: 1; }
.baseline { stroke: var(--viz-grid); stroke-width: 1; }
.tick { fill: var(--faint); font-size: 11px; }
.hit { fill: transparent; }
.band { fill: var(--viz-band); }
path { transition: opacity 0.15s; }
path.dim { opacity: 0.45; }
.tooltip {
  position: absolute;
  top: 0;
  transform: translateX(10px);
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: 0 6px 20px oklch(0% 0 0 / 0.2);
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}
.tooltip.left { transform: translateX(calc(-100% - 10px)); }
.tip-date { margin: 0 0 2px; font-size: 12px; color: var(--muted); }
.tip-row { margin: 0; font-size: 13px; }
.tip-row strong { font-weight: 650; }
</style>
