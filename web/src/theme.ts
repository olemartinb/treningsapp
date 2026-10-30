// Dark by default; the choice is remembered per device.
import { ref } from 'vue';

type Theme = 'dark' | 'light';

export const theme = ref<Theme>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#0b0d12' : '#f5f6f8');
  try {
    localStorage.setItem('theme', theme.value);
  } catch {}
}
