<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{ icon: Component; title: string; text?: string }>();
</script>

<template>
  <section class="card empty rise">
    <div class="badge"><component :is="icon" :stroke-width="1.75" aria-hidden="true" /></div>
    <h2>{{ title }}</h2>
    <p v-if="text" class="muted small">{{ text }}</p>
    <slot />
  </section>
</template>

<style scoped>
.empty { display: grid; justify-items: center; text-align: center; padding: 40px 24px; gap: 4px; }
.badge {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 12px;
  border-radius: 18px;
  background: var(--surface-2);
  color: var(--muted);
}
.badge svg { width: 26px; height: 26px; }
h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
p { margin: 0; max-width: 32ch; }
</style>
