<script setup lang="ts">
import { ListChecks } from 'lucide-vue-next';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
</script>

<template>
  <div>
    <PageHeader title="Plan" />
    <EmptyState :icon="ListChecks" title="Planen kommer" text="De neste 8 ukene med uketype fra kalenderen, løp og km-mål per uke." />
  </div>
</template>
