<script setup lang="ts">
import { ChartLine } from 'lucide-vue-next';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
</script>

<template>
  <div>
    <PageHeader title="Fremgang" />
    <EmptyState :icon="ChartLine" title="Grafene kommer" text="Km per uke, terskelfart mot 3:47/km, aerob effektivitet, vekt og knetest-historikk." />
  </div>
</template>
