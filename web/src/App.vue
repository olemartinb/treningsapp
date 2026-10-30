<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { router } from './router';

const route = useRoute();
const tabs = router.getRoutes().filter((r) => r.meta.label);

const theme = ref(document.documentElement.dataset.theme ?? 'dark');
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme.value;
  try {
    localStorage.setItem('theme', theme.value);
  } catch {}
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <span class="brand">Trening</span>
      <button class="theme" :aria-label="theme === 'dark' ? 'Lyst tema' : 'Mørkt tema'" @click="toggleTheme">
        {{ theme === 'dark' ? '☀︎' : '☾' }}
      </button>
    </header>
    <main><RouterView /></main>
    <nav class="tabs">
      <RouterLink v-for="t in tabs" :key="t.path" :to="t.path" :class="{ active: route.path === t.path }">
        {{ t.meta.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  max-width: 560px;
  margin: 0 auto;
  min-height: 100dvh;
  padding: 0 16px calc(80px + env(safe-area-inset-bottom));
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(12px + env(safe-area-inset-top)) 0 8px;
}
.brand { font-weight: 700; letter-spacing: 0.02em; }
.theme {
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  width: 40px;
  height: 40px;
  cursor: pointer;
}
.tabs {
  position: fixed;
  inset: auto 0 0 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}
.tabs a {
  text-align: center;
  padding: 14px 0;
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
}
.tabs a.active { color: var(--accent); }
</style>
