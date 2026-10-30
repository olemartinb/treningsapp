<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import type { PlannedSession } from '../api';
import { formatDecimal } from '../format';
import { KIND_ICON, SESSION_KINDS } from '../sessions';

defineProps<{ session: PlannedSession }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button
    class="chip"
    :class="[session.kind, { hard: SESSION_KINDS[session.kind].hard, done: session.done }]"
    @click="$emit('open')"
  >
    <component :is="KIND_ICON[session.kind]" class="icon" aria-hidden="true" />
    <span class="title">{{ session.title }}</span>
    <span v-if="session.km" class="km num">{{ formatDecimal(session.km) }}</span>
    <Check v-if="session.done" class="check" aria-label="Gjort" />
  </button>
</template>

<style scoped>
.chip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  text-align: left;
  font-size: 14px;
  transition: transform 0.15s var(--ease);
}
.chip:active { transform: scale(0.98); }
.icon { flex: none; width: 16px; height: 16px; color: var(--muted); }
.hard .icon { color: var(--warn); }
.race .icon { color: var(--bad); }
.title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
.km { flex: none; font-weight: 650; }
.check { flex: none; width: 16px; height: 16px; color: var(--ok); }
.done .title { color: var(--muted); text-decoration: line-through; text-decoration-color: color-mix(in oklch, var(--muted) 60%, transparent); }
</style>
