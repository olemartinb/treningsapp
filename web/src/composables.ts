// Small Vue composables.
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** Tracks an element's content width (for SVG charts drawn in pixels). */
export function useElementWidth(el: Ref<HTMLElement | null>) {
  const width = ref(0);
  let observer: ResizeObserver | undefined;
  onMounted(() => {
    if (!el.value) return;
    width.value = el.value.clientWidth;
    observer = new ResizeObserver(([entry]) => (width.value = entry!.contentRect.width));
    observer.observe(el.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return width;
}
