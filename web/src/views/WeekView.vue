<script setup lang="ts">
import { CalendarDays } from 'lucide-vue-next';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
</script>

<template>
  <div>
    <PageHeader title="Uke" />
    <EmptyState :icon="CalendarDays" title="Ukeoversikt kommer" text="7 dager med barneuke/eneuke-farger, planlagt mot gjennomført og km-mål." />
  </div>
</template>
