<script setup lang="ts">
// Time series on one y-axis: lines and/or dots, an optional reference line,
// and a crosshair tooltip (pointer and arrow keys) listing every series at that date.
import { computed, ref } from 'vue';
import { useElementWidth } from '../../composables';
import { dayNumber, linear, niceTicks } from '../../chart';
import { formatShortDate } from '../../format';

export interface TrendSeries {
  label: string;
  /** CSS colour (a --viz-* token). */
  color: string;
  kind: 'line' | 'dots';
  values: (number | null)[];
  /** Label the last value at the line end. */
  endLabel?: boolean;
}

const props = withDefaults(
  defineProps<{
    dates: string[];
    series: TrendSeries[];
    format: (v: number) => string;
    /** Lower values drawn higher (pace: faster is up). */
    invert?: boolean;
    reference?: { value: number; label: string };
    height?: number;
    /** Accessible name for the chart. */
    label: string;
  }>(),
  { invert: false, height: 200, reference: undefined },
);

const root = ref<HTMLElement | null>(null);
const width = useElementWidth(root);
const PAD = { top: 16, right: 44, bottom: 24, left: 40 };

const plot = computed(() => ({
  x0: PAD.left,
  x1: Math.max(PAD.left + 10, width.value - PAD.right),
  y0: PAD.top,
  y1: props.height - PAD.bottom,
}));

const domain = computed(() => {
  const vals = props.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (props.reference) vals.push(props.reference.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min || Math.abs(max) || 1) * 0.08;
  return { min: min - pad, max: max + pad };
});

const xs = computed(() => {
  const first = dayNumber(props.dates[0] ?? '1970-01-01');
  const last = dayNumber(props.dates.at(-1) ?? '1970-01-01');
  const scale = linear(first, last, plot.value.x0, plot.value.x1);
  return props.dates.map((d) => scale(dayNumber(d)));
});
const y = computed(() => {
  const { min, max } = domain.value;
  return props.invert ? linear(min, max, plot.value.y0, plot.value.y1) : linear(min, max, plot.value.y1, plot.value.y0);
});
const ticks = computed(() => niceTicks(domain.value.min, domain.value.max, 3));

function linePath(values: (number | null)[]): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) return void (pen = false);
    d += `${pen ? 'L' : 'M'}${xs.value[i]!.toFixed(1)},${y.value(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

const xLabels = computed(() => {
  const n = props.dates.length;
  if (!n) return [];
  const idx = n <= 2 ? [...Array(n).keys()] : [0, Math.floor((n - 1) / 2), n - 1];
  return idx.map((i) => ({ x: xs.value[i]!, text: formatShortDate(props.dates[i]!), anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }));
});

const endLabels = computed(() =>
  props.series
    .filter((s) => s.endLabel)
    .map((s) => {
      const i = s.values.findLastIndex((v) => v !== null);
      return i < 0 ? null : { x: xs.value[i]! + 8, y: y.value(s.values[i]!), text: props.format(s.values[i]!), color: s.color };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null),
);

// --- Hover / keyboard ------------------------------------------------------
const active = ref<number | null>(null);
function nearest(px: number): number {
  let best = 0;
  xs.value.forEach((x, i) => {
    if (Math.abs(x - px) < Math.abs(xs.value[best]! - px)) best = i;
  });
  return best;
}
function onMove(e: PointerEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
  active.value = nearest(e.clientX - rect.left);
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const last = props.dates.length - 1;
  const cur = active.value ?? last;
  active.value = Math.max(0, Math.min(last, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
}
const tip = computed(() => {
  const i = active.value;
  if (i === null) return null;
  const x = xs.value[i]!;
  const rows = props.series
    .map((s) => ({ label: s.label, color: s.color, value: s.values[i] }))
    .filter((r) => r.value !== null && r.value !== undefined);
  return { x, date: props.dates[i]!, rows, left: x > width.value / 2 };
});
</script>

<template>
  <div ref="root" class="chart" :style="{ height: `${height}px` }">
    <svg
      v-if="width"
      :width="width"
      :height="height"
      tabindex="0"
      role="img"
      :aria-label="label"
      @pointermove="onMove"
      @pointerleave="active = null"
      @keydown="onKey"
      @blur="active = null"
    >
      <g class="grid">
        <template v-for="t in ticks" :key="t">
          <line :x1="plot.x0" :x2="plot.x1" :y1="y(t)" :y2="y(t)" />
          <text class="tick tnum" :x="plot.x0 - 6" :y="y(t)" dy="0.32em" text-anchor="end">{{ format(t) }}</text>
        </template>
      </g>
      <text v-for="l in xLabels" :key="l.text" class="tick" :x="l.x" :y="height - 6" :text-anchor="l.anchor">{{ l.text }}</text>

      <g v-if="reference" class="reference">
        <line :x1="plot.x0" :x2="plot.x1" :y1="y(reference.value)" :y2="y(reference.value)" />
        <text :x="plot.x1" :y="y(reference.value) - 5" text-anchor="end">{{ reference.label }}</text>
      </g>

      <template v-for="s in series" :key="s.label">
        <path v-if="s.kind === 'line'" class="line" :d="linePath(s.values)" :style="{ stroke: s.color }" />
        <template v-else>
          <template v-for="(v, i) in s.values" :key="i">
            <circle v-if="v !== null" class="dot" :cx="xs[i]" :cy="y(v)" r="4" :style="{ fill: s.color }" />
          </template>
        </template>
      </template>

      <text v-for="l in endLabels" :key="l.text + l.y" class="end-label tnum" :x="l.x" :y="l.y" dy="0.32em">{{ l.text }}</text>

      <g v-if="tip" class="crosshair">
        <line :x1="tip.x" :x2="tip.x" :y1="plot.y0" :y2="plot.y1" />
      </g>
    </svg>

    <div v-if="tip" class="tooltip" :class="{ left: tip.left }" :style="{ left: `${tip.x}px` }" role="status">
      <p class="tip-date">{{ formatShortDate(tip.date) }}</p>
      <p v-for="r in tip.rows" :key="r.label" class="tip-row">
        <i :style="{ background: r.color }" />
        <strong class="tnum">{{ format(r.value!) }}</strong>
        <span>{{ r.label }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; }
svg { display: block; overflow: visible; touch-action: pan-y; outline: none; }
svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
.grid line { stroke: var(--viz-grid); stroke-width: 1; }
.tick { fill: var(--faint); font-size: 11px; }
.reference line { stroke: var(--muted); stroke-width: 1.5; }
.reference text { fill: var(--muted); font-size: 11px; font-weight: 600; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.dot { stroke: var(--surface-solid, var(--bg)); stroke-width: 2; }
.end-label { fill: var(--text); font-size: 11px; font-weight: 600; }
.crosshair line { stroke: var(--muted); stroke-width: 1; }
.tooltip {
  position: absolute;
  top: 0;
  transform: translateX(10px);
  min-width: 110px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: 0 6px 20px oklch(0% 0 0 / 0.2);
  pointer-events: none;
  z-index: 2;
}
.tooltip.left { transform: translateX(calc(-100% - 10px)); }
.tip-date { margin: 0 0 4px; font-size: 12px; color: var(--muted); }
.tip-row { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; white-space: nowrap; }
.tip-row i { width: 10px; height: 2px; border-radius: 1px; }
.tip-row strong { font-weight: 650; }
.tip-row span { color: var(--muted); }
</style>
