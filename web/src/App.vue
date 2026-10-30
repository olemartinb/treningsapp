<script setup lang="ts">
import { CalendarDays, ChartLine, ListChecks, Sun } from 'lucide-vue-next';
import { useRoute } from 'vue-router';

const route = useRoute();
const tabs = [
  { path: '/', label: 'I dag', icon: Sun },
  { path: '/uke', label: 'Uke', icon: CalendarDays },
  { path: '/plan', label: 'Plan', icon: ListChecks },
  { path: '/fremgang', label: 'Fremgang', icon: ChartLine },
];
</script>

<template>
  <div class="shell">
    <RouterView v-slot="{ Component }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>

    <nav class="tabs" aria-label="Hovedmeny">
      <RouterLink
        v-for="t in tabs"
        :key="t.path"
        :to="t.path"
        :class="{ active: route.path === t.path }"
        :aria-current="route.path === t.path ? 'page' : undefined"
      >
        <component :is="t.icon" :stroke-width="2" aria-hidden="true" />
        <span>{{ t.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  max-width: 560px;
  margin: 0 auto;
  min-height: 100dvh;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(112px + env(safe-area-inset-bottom));
}

.tabs {
  position: fixed;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  translate: -50% 0;
  width: min(100% - 32px, 420px);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in oklch, var(--surface-2) 72%, transparent);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 12px 40px oklch(0% 0 0 / 0.25);
  z-index: 10;
}

.tabs a {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 8px 0 6px;
  border-radius: 999px;
  color: var(--muted);
  text-decoration: none;
  font-size: 11px;
  font-weight: 600;
  transition: color 0.2s, background-color 0.25s var(--ease);
}
.tabs a svg { width: 22px; height: 22px; }
.tabs a.active {
  color: var(--text);
  background: color-mix(in oklch, var(--text) 10%, transparent);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
