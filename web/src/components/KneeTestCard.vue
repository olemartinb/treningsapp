<script setup lang="ts">
import { ref } from 'vue';
import { Check, X } from 'lucide-vue-next';
import { api, type DailyLog } from '../api';
import { formatTime } from '../format';

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
    <p class="eyebrow">Knetest · venstre kne</p>

    <Transition name="swap" mode="out-in">
      <div v-if="log.kneeOk === null" key="ask">
        <h2>Kne OK i dag?</h2>
        <p class="muted small">5 dype ettbeins knebøy + trapp. Må være 100 % smertefritt før du løper.</p>
        <div class="choices">
          <button class="choice yes" :disabled="saving" @click="save(true)">
            <Check :stroke-width="2.5" aria-hidden="true" />
            <span>Ja, smertefritt</span>
          </button>
          <button class="choice no" :disabled="saving" @click="save(false)">
            <X :stroke-width="2.5" aria-hidden="true" />
            <span>Nei</span>
          </button>
        </div>
      </div>

      <div v-else key="result" class="result">
        <div class="seal">
          <Check v-if="log.kneeOk" :stroke-width="3" aria-hidden="true" />
          <X v-else :stroke-width="3" aria-hidden="true" />
        </div>
        <div class="text">
          <h2>{{ log.kneeOk ? 'Kne OK' : 'Ikke smertefritt' }}</h2>
          <p class="small">
            <template v-if="log.kneeOk">Klar for løping<template v-if="log.kneeTestedAt"> · testet {{ formatTime(log.kneeTestedAt) }}</template></template>
            <template v-else>Ingen løping i dag. Ta <strong>spinning</strong> eller <strong>gange på mølle</strong>.</template>
          </p>
        </div>
        <button class="btn ghost" :disabled="saving" @click="save(null)">Endre</button>
      </div>
    </Transition>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.knee { transition: border-color 0.3s, background-color 0.3s; }
.knee.ok { border-color: color-mix(in oklch, var(--ok) 40%, transparent); background: color-mix(in oklch, var(--ok) 10%, var(--surface)); }
.knee.bad { border-color: color-mix(in oklch, var(--bad) 45%, transparent); background: color-mix(in oklch, var(--bad) 10%, var(--surface)); }

h2 { margin: 0 0 4px; font-size: 26px; font-weight: 650; letter-spacing: -0.03em; }
p { margin: 0; }

.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
.choice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 64px;
  border-radius: 20px;
  border: 1px solid var(--border);
  font-size: 17px;
  font-weight: 650;
  transition: transform 0.15s var(--ease), filter 0.2s;
}
.choice:active:not(:disabled) { transform: scale(0.97); }
.choice svg { width: 22px; height: 22px; }
.yes { grid-column: 1 / -1; background: var(--ok); color: var(--on-color); border-color: transparent; min-height: 72px; font-size: 19px; }
.no { grid-column: 1 / -1; background: transparent; color: var(--bad); border-color: color-mix(in oklch, var(--bad) 35%, transparent); }

.result { display: flex; align-items: center; gap: 14px; }
.text { flex: 1; min-width: 0; }
.seal {
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: var(--on-color);
}
.seal svg { width: 26px; height: 26px; }
.ok .seal { background: var(--ok); box-shadow: 0 0 0 6px color-mix(in oklch, var(--ok) 18%, transparent), 0 0 32px color-mix(in oklch, var(--ok) 45%, transparent); }
.bad .seal { background: var(--bad); box-shadow: 0 0 0 6px color-mix(in oklch, var(--bad) 18%, transparent); }
.ok h2 { color: var(--ok); margin: 0; font-size: 22px; }
.bad h2 { color: var(--bad); margin: 0; font-size: 22px; }

.error { color: var(--bad); margin-top: 10px; }

.swap-enter-active, .swap-leave-active { transition: opacity 0.2s var(--ease), transform 0.25s var(--ease); }
.swap-enter-from { opacity: 0; transform: scale(0.98); }
.swap-leave-to { opacity: 0; }
</style>
