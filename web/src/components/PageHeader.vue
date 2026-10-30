<script setup lang="ts">
import { Moon, SunMedium } from 'lucide-vue-next';
import { theme, toggleTheme } from '../theme';

defineProps<{ overline?: string; title: string }>();
</script>

<template>
  <header class="head rise">
    <div>
      <p v-if="overline" class="overline">{{ overline }}</p>
      <h1>{{ title }}</h1>
    </div>
    <button class="icon-btn" :aria-label="theme === 'dark' ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'" @click="toggleTheme">
      <SunMedium v-if="theme === 'dark'" />
      <Moon v-else />
    </button>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding: 8px 4px 20px;
}
.overline {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 550;
  color: var(--muted);
}
h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.05;
  font-weight: 650;
  letter-spacing: -0.035em;
}
</style>
