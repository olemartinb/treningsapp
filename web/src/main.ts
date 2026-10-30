import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import '@fontsource-variable/geist';
import './styles.css';

createApp(App).use(router).mount('#app');
