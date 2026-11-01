import { createRouter, createWebHistory } from 'vue-router';
import TodayView from './views/TodayView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: TodayView, meta: { label: 'I dag' } },
    { path: '/uke', name: 'week', component: () => import('./views/WeekView.vue'), meta: { label: 'Uke' } },
    { path: '/plan', name: 'plan', component: () => import('./views/PlanView.vue'), meta: { label: 'Plan' } },
    { path: '/fremgang', name: 'progress', component: () => import('./views/ProgressView.vue'), meta: { label: 'Fremgang' } },
    { path: '/helse', name: 'health', component: () => import('./views/HealthView.vue'), meta: { label: 'Helse' } },
  ],
});
