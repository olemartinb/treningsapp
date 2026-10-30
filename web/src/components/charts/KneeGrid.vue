<script setup lang="ts">
// Knee test per day, Monday-aligned rows. Status colours always come with an icon.
import { computed } from 'vue';
import { Check, X } from 'lucide-vue-next';
import type { Progress } from '../../api';
import { formatWeekdayDate } from '../../format';

const props = defineProps<{ days: Progress['knee'] }>();

/** Leading blanks so the first row starts on Monday. */
const offset = computed(() => {
  const first = props.days[0]?.date;
  return first ? (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
});
const label = (d: Progress['knee'][number]) =>
  `${formatWeekdayDate(d.date)}: ${d.ok === true ? 'smertefri' : d.ok === false ? 'ikke smertefri' : 'ikke testet'}`;
</script>

<template>
  <div>
    <div class="weekdays small" aria-hidden="true"><span v-for="(w, i) in ['M', 'T', 'O', 'T', 'F', 'L', 'S']" :key="i">{{ w }}</span></div>
    <ol class="grid" aria-label="Knetest per dag">
      <li v-for="n in offset" :key="`blank-${n}`" class="blank" aria-hidden="true" />
      <li v-for="d in days" :key="d.date" :class="d.ok === true ? 'ok' : d.ok === false ? 'bad' : 'none'" :title="label(d)" :aria-label="label(d)">
        <Check v-if="d.ok === true" aria-hidden="true" />
        <X v-else-if="d.ok === false" aria-hidden="true" />
      </li>
    </ol>
    <p class="legend small">
      <span><i class="ok"><Check aria-hidden="true" /></i>Smertefri</span>
      <span><i class="bad"><X aria-hidden="true" /></i>Ikke smertefri</span>
      <span><i class="none" />Ikke testet</span>
    </p>
  </div>
</template>

<style scoped>
.weekdays, .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.weekdays { margin-bottom: 4px; color: var(--faint); text-align: center; font-weight: 600; font-size: 11px; }
.grid { list-style: none; margin: 0; padding: 0; }
.grid li { aspect-ratio: 1; max-height: 40px; border-radius: 6px; display: grid; place-items: center; }
.grid svg { width: 55%; height: 55%; color: #fff; stroke-width: 3; }
.ok { background: var(--status-good); }
.bad { background: var(--status-critical); }
.none { background: var(--surface-3); }
.blank { visibility: hidden; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 10px 0 0; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { display: grid; place-items: center; width: 14px; height: 14px; border-radius: 4px; }
.legend i svg { width: 10px; height: 10px; color: #fff; stroke-width: 3; }
</style>
