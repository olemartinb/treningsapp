import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 8787}` },
  },
});
