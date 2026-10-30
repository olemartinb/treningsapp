<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Minus, Plus } from 'lucide-vue-next';
import { api, type DailyLog, type Today } from '../api';
import { formatDecimal } from '../format';

const props = defineProps<{ log: DailyLog; weight: Today['weight'] }>();
const emit = defineEmits<{ saved: [log: DailyLog] }>();

const TARGET_KG = 68;
const FALLBACK_KG = 72;
/** The progress bar spans the last 5 kg down to the target. */
const BAR_SPAN_KG = 5;

const input = ref('');
const saving = ref(false);
const error = ref<string | null>(null);

const startValue = () => props.log.weightKg ?? props.weight.last?.weightKg ?? null;

watch(
  () => [props.log.weightKg, props.weight.last?.weightKg],
  () => {
    const kg = startValue();
    input.value = kg === null ? '' : formatDecimal(kg);
  },
  { immediate: true },
);

const parsed = computed(() => {
  const kg = Number(input.value.replace(',', '.'));
  return input.value.trim() && Number.isFinite(kg) ? Math.round(kg * 10) / 10 : null;
});
const savedToday = computed(() => props.log.weightKg !== null && parsed.value === props.log.weightKg);

function step(delta: number) {
  const base = parsed.value ?? startValue() ?? FALLBACK_KG;
  input.value = formatDecimal(Math.round((base + delta) * 10) / 10);
}

const toGo = computed(() => {
  const basis = props.weight.avg7 ?? props.log.weightKg;
  return basis === null ? null : Math.max(0, Math.round((basis - TARGET_KG) * 10) / 10);
});

async function save() {
  const kg = parsed.value;
  if (kg === null || kg < 40 || kg > 150) {
    error.value = 'Skriv inn vekt i kg, f.eks. 71,8';
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    emit('saved', await api.saveLog(props.log.date, { weightKg: kg }));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card">
    <div class="top">
      <p class="eyebrow">Vekt · fastende</p>
      <span v-if="weight.avg7 !== null" class="avg small">
        Snitt 7 d <strong class="num">{{ formatDecimal(weight.avg7) }}</strong>
      </span>
    </div>

    <form class="entry" @submit.prevent="save">
      <button type="button" class="icon-btn step" aria-label="Minus 0,1 kg" @click="step(-0.1)"><Minus /></button>
      <label class="value">
        <input
          v-model="input"
          class="num"
          inputmode="decimal"
          enterkeyhint="done"
          placeholder="–"
          aria-label="Vekt i kg"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <span class="unit">kg</span>
      </label>
      <button type="button" class="icon-btn step" aria-label="Pluss 0,1 kg" @click="step(0.1)"><Plus /></button>
      <button class="btn save" :class="{ primary: !savedToday }" :disabled="saving || savedToday || parsed === null">
        <template v-if="savedToday"><Check :stroke-width="2.5" aria-hidden="true" /> Lagret</template>
        <template v-else>Lagre vekt</template>
      </button>
    </form>

    <div v-if="toGo !== null" class="goal">
      <div class="bar"><i :style="{ width: `${Math.max(4, 100 - (toGo / BAR_SPAN_KG) * 100)}%` }" /></div>
      <p class="small muted">
        <template v-if="toGo > 0"><strong class="num">{{ formatDecimal(toGo) }} kg</strong> igjen til {{ TARGET_KG }} kg</template>
        <template v-else>Ved målet på {{ TARGET_KG }} kg</template>
        <template v-if="weight.avg7 !== null"> · basert på snittet</template>
      </p>
    </div>
    <p v-if="error" class="error small" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: baseline; }
.avg { color: var(--muted); }
.avg strong { color: var(--text); font-weight: 600; }

.entry {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}
.value {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
input {
  width: 4.2ch;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: right;
  font-size: 56px;
  font-weight: 600;
  line-height: 1.1;
  outline: none;
}
input::placeholder { color: var(--faint); }
.unit { font-size: 18px; font-weight: 550; color: var(--muted); }
.step { width: 52px; height: 52px; background: var(--surface-2); }
.save { grid-column: 1 / -1; margin-top: 12px; }

.goal { margin-top: 16px; }
.goal p { margin: 8px 0 0; }
.goal strong { color: var(--text); font-weight: 600; }
.bar { height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--ok)); transition: width 0.6s var(--ease); }
.error { color: var(--bad); margin: 10px 0 0; }
</style>
