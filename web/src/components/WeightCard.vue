<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type DailyLog } from '../api';
import { formatKg } from '../format';

const props = defineProps<{ log: DailyLog }>();
const emit = defineEmits<{ saved: [log: DailyLog] }>();

const TARGET_KG = 68;
const input = ref('');
const saving = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.log.weightKg,
  (kg) => (input.value = kg === null ? '' : kg.toFixed(1).replace('.', ',')),
  { immediate: true },
);

async function save() {
  const kg = Number(input.value.replace(',', '.'));
  if (!Number.isFinite(kg) || kg < 40 || kg > 150) {
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
    <h2>Vekt (fastende)</h2>
    <form class="row" @submit.prevent="save">
      <input v-model="input" inputmode="decimal" placeholder="71,8" aria-label="Vekt i kg" />
      <span class="unit">kg</span>
      <button class="btn primary" :disabled="saving">Lagre</button>
    </form>
    <p v-if="log.weightKg !== null" class="muted small">
      Lagret {{ formatKg(log.weightKg) }} · {{ formatKg(Math.max(0, Math.round((log.weightKg - TARGET_KG) * 10) / 10)) }} til
      {{ TARGET_KG }} kg
    </p>
    <p v-if="error" class="error small">{{ error }}</p>
  </section>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 10px; }
input {
  flex: 1;
  min-width: 0;
  width: 100%;
  font-size: 24px;
  font-weight: 700;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}
.unit { color: var(--muted); }
.error { color: var(--bad); }
</style>
