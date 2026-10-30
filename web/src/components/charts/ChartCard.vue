<script setup lang="ts">
// Card around a chart: title, optional legend, the chart, and a table view.
defineProps<{ title: string; subtitle?: string; empty?: string | null }>();
</script>

<template>
  <section class="card chart-card">
    <h2>{{ title }}</h2>
    <p v-if="subtitle" class="small muted sub">{{ subtitle }}</p>
    <p v-if="empty" class="empty small">{{ empty }}</p>
    <template v-else>
      <div v-if="$slots.legend" class="legend small"><slot name="legend" /></div>
      <slot />
      <details v-if="$slots.table" class="table-view">
        <summary class="small">Vis tabell</summary>
        <div class="table-wrap"><slot name="table" /></div>
      </details>
    </template>
  </section>
</template>

<style scoped>
h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
.sub { margin: 2px 0 12px; }
.empty { margin: 8px 0 0; padding: 16px; border-radius: 12px; background: var(--surface-2); color: var(--muted); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 10px; color: var(--muted); }
.legend :deep(.key) { display: inline-flex; align-items: center; gap: 6px; }
.legend :deep(.swatch) { width: 10px; height: 10px; border-radius: 3px; }
.legend :deep(.linekey) { width: 14px; height: 2px; border-radius: 1px; }
.table-view { margin-top: 10px; }
.table-view summary { cursor: pointer; color: var(--muted); font-weight: 550; }
.table-wrap { max-height: 260px; overflow: auto; margin-top: 8px; }
.table-wrap :deep(table) { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.table-wrap :deep(th), .table-wrap :deep(td) { padding: 4px 6px; text-align: right; border-bottom: 1px solid var(--border); }
.table-wrap :deep(th:first-child), .table-wrap :deep(td:first-child) { text-align: left; }
.table-wrap :deep(th) { color: var(--muted); font-weight: 600; position: sticky; top: 0; background: var(--surface-solid); }
</style>
