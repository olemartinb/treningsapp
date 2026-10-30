<script setup lang="ts">
import { ref } from 'vue';
import { api, type DailyLog } from '../api';

const props = defineProps<{ log: DailyLog }>();
const emit = defineEmits<{ saved: [log: DailyLog] }>();

const saving = ref(false);
const error = ref<string | null>(null);

async function save(kneeOk: boolean | null) {
  saving.value = true;
  error.value = null;
  try {
    emit('saved', await api.saveLog(props.log.date, { kneeOk }));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card knee" :class="{ ok: log.kneeOk === true, bad: log.kneeOk === false }">
    <h2>Knetest</h2>

    <template v-if="log.kneeOk === null">
      <p class="question">Kne OK i dag?</p>
      <p class="muted small">5 dype ettbeins knebøy på venstre + trapp. Må være 100 % smertefritt.</p>
      <div class="actions">
        <button class="btn yes" :disabled="saving" @click="save(true)">Ja, smertefritt</button>
        <button class="btn no" :disabled="saving" @click="save(false)">Nei</button>
      </div>
    </template>

    <template v-else-if="log.kneeOk">
      <p class="question">✓ Kne OK</p>
      <p class="muted small">Klar for løping i dag.</p>
    </template>

    <template v-else>
      <p class="question">✗ Ikke smertefritt</p>
      <p class="small">Ingen løping i dag. Bytt økta med <strong>spinning</strong> eller <strong>gange på mølle</strong>.</p>
    </template>

    <button v-if="log.kneeOk !== null" class="link small" :disabled="saving" @click="save(null)">Angre</button>
    <p v-if="error" class="error small">{{ error }}</p>
  </section>
</template>

<style scoped>
.knee.ok { border-color: var(--ok); background: var(--ok-bg); }
.knee.bad { border-color: var(--bad); background: var(--bad-bg); }
.question { font-size: 26px; font-weight: 700; margin: 4px 0; }
.knee.ok .question { color: var(--ok); }
.knee.bad .question { color: var(--bad); }
.actions { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-top: 12px; }
.actions .btn { min-height: 64px; font-size: 18px; font-weight: 700; }
.yes { background: var(--ok); border-color: var(--ok); color: #06150d; }
.no { background: var(--bad-bg); border-color: var(--bad); color: var(--bad); }
.link { background: none; border: none; color: var(--muted); text-decoration: underline; padding: 8px 0 0; cursor: pointer; }
.error { color: var(--bad); }
</style>
