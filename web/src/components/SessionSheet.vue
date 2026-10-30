<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import { api, ApiError, type PlannedSession, type SessionKind } from '../api';
import { formatWeekdayDate } from '../format';
import { KIND_ICON, KIND_ORDER, SESSION_KINDS } from '../sessions';

/** Edit an existing session, or create one on `date`. */
const props = defineProps<{ session: PlannedSession | null; date: string | null }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const kind = ref<SessionKind>('easy');
const title = ref('');
const km = ref('');
const details = ref('');
const done = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const open = computed(() => props.session !== null || props.date !== null);
const date = computed(() => props.session?.date ?? props.date ?? '');
const isRunKind = computed(() => SESSION_KINDS[kind.value].run);

watch(open, async (isOpen) => {
  if (!isOpen) return dialog.value?.close();
  const s = props.session;
  kind.value = s?.kind ?? 'easy';
  title.value = s?.title ?? '';
  km.value = s?.km != null ? String(s.km).replace('.', ',') : '';
  details.value = s?.details ?? '';
  done.value = s?.done ?? false;
  error.value = null;
  await nextTick();
  dialog.value?.showModal();
});

function parseKm(): number | null | undefined {
  if (!isRunKind.value || !km.value.trim()) return null;
  const n = Number(km.value.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n : undefined;
}

async function run(action: () => Promise<unknown>) {
  saving.value = true;
  error.value = null;
  try {
    await action();
    emit('changed');
    emit('close');
  } catch (e) {
    error.value = e instanceof ApiError ? `Kunne ikke lagre: ${e.message}` : 'Kunne ikke lagre';
  } finally {
    saving.value = false;
  }
}

function save() {
  const parsedKm = parseKm();
  if (parsedKm === undefined) {
    error.value = 'Km må være et tall, f.eks. 8 eller 12,5';
    return;
  }
  const fields = {
    kind: kind.value,
    title: title.value.trim() || SESSION_KINDS[kind.value].label,
    km: parsedKm,
    details: details.value.trim() || null,
  };
  void run(() =>
    props.session
      ? api.updateSession(props.session.id, { ...fields, done: done.value })
      : api.createSession({ ...fields, date: date.value }),
  );
}

function remove() {
  if (props.session) void run(() => api.deleteSession(props.session!.id));
}
</script>

<template>
  <dialog ref="dialog" class="sheet" @close="emit('close')" @click.self="dialog?.close()">
    <form v-if="open" class="body" @submit.prevent="save">
      <header>
        <div>
          <p class="muted small">{{ formatWeekdayDate(date) }}</p>
          <h2>{{ session ? 'Endre økt' : 'Ny økt' }}</h2>
        </div>
        <button type="button" class="icon-btn" aria-label="Lukk" @click="dialog?.close()"><X /></button>
      </header>

      <fieldset class="kinds">
        <legend class="small muted">Type</legend>
        <button
          v-for="k in KIND_ORDER"
          :key="k"
          type="button"
          class="kind"
          :class="{ on: kind === k }"
          :aria-pressed="kind === k"
          @click="kind = k"
        >
          <component :is="KIND_ICON[k]" aria-hidden="true" />
          {{ SESSION_KINDS[k].label }}
        </button>
      </fieldset>

      <label class="field">
        <span class="small muted">Tittel</span>
        <input v-model="title" :placeholder="SESSION_KINDS[kind].label" maxlength="120" />
      </label>

      <label v-if="isRunKind" class="field">
        <span class="small muted">Km løping</span>
        <input v-model="km" inputmode="decimal" placeholder="f.eks. 10" />
      </label>

      <label class="field">
        <span class="small muted">Detaljer</span>
        <textarea v-model="details" rows="3" maxlength="1000" placeholder="Tempo, intervaller, soner …" />
      </label>

      <label v-if="session" class="toggle">
        <input v-model="done" type="checkbox" />
        <span>Gjennomført</span>
      </label>

      <p v-if="error" class="error small" role="alert">{{ error }}</p>

      <div class="actions">
        <button v-if="session" type="button" class="btn ghost danger" :disabled="saving" @click="remove">
          <Trash2 aria-hidden="true" /> Slett
        </button>
        <button class="btn primary" :disabled="saving">Lagre</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.sheet {
  width: min(100%, 560px);
  max-height: 92dvh;
  margin: auto auto 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--surface-2);
  color: var(--text);
}
.sheet::backdrop { background: oklch(0% 0 0 / 0.5); backdrop-filter: blur(2px); }
.sheet[open] { animation: up 0.28s var(--ease); }
@keyframes up { from { transform: translateY(40px); opacity: 0; } }
.body { display: grid; gap: 14px; padding: 20px 16px calc(20px + env(safe-area-inset-bottom)); }
header { display: flex; justify-content: space-between; align-items: flex-start; }
header p { margin: 0; }
h2 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
.kinds { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; border: 0; }
.kinds legend { margin-bottom: 6px; }
.kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 14px;
  font-weight: 550;
}
.kind svg { width: 15px; height: 15px; }
.kind.on { background: var(--text); color: var(--bg); border-color: transparent; }
.field { display: grid; gap: 4px; }
input:not([type='checkbox']), textarea {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 16px;
  resize: vertical;
}
.toggle { display: flex; align-items: center; gap: 10px; font-weight: 550; }
.toggle input { width: 22px; height: 22px; accent-color: var(--ok); }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions .primary { min-width: 120px; }
.danger { color: var(--bad); margin-right: auto; }
.error { color: var(--bad); margin: 0; }
</style>
