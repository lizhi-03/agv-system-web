<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number | string
    strokeWidth?: number
  }>(),
  { size: 18, strokeWidth: 1.7 },
)

/** 内联 SVG 图标库（24×24 线性图标，全部本地绘制，无第三方图标依赖） */
const ICONS: Record<string, string> = {
  dashboard:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z"/><path d="M9 4v13.5"/><path d="M15 6.5V20"/>',
  agv: '<rect x="3.5" y="8" width="17" height="10" rx="3"/><circle cx="8" cy="13" r="1.2"/><circle cx="16" cy="13" r="1.2"/><path d="M9 8V6"/><path d="M15 8V6"/>',
  task: '<rect x="4.5" y="4" width="15" height="17" rx="3"/><path d="M9 4V3.2h6V4"/><path d="m8 11 1.8 1.8 3.2-3.2"/><path d="M13.5 12h3.5"/><path d="m8 16.5 1.8 1.8 3.2-3.2"/><path d="M13.5 17h3.5"/>',
  editor:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8.5 15.5.8-3.2 6.4-6.4a1.5 1.5 0 0 1 2.2 2.2l-6.4 6.4-3 1Z"/><path d="m14 7 2.4 2.4"/>',
  log: '<path d="M8.5 6.5h12"/><path d="M8.5 12h12"/><path d="M8.5 17.5h12"/><path d="m3.5 5.8 1.4 1.4L3.5 8.6"/><path d="m3.5 11.3 1.4 1.4-1.4 1.4"/><path d="m3.5 16.8 1.4 1.4-1.4 1.4"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V9h-5.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  'chevron-left': '<path d="m14.5 5.5-7 6.5 7 6.5"/>',
  'chevron-right': '<path d="m9.5 5.5 7 6.5-7 6.5"/>',
  'chevron-down': '<path d="m5.5 9 6.5 7 6.5-7"/>',
  'chevron-up': '<path d="m5.5 15 6.5-7 6.5 7"/>',
  play: '<path d="M7 5.2v13.6L19 12 7 5.2Z"/>',
  pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
  bolt: '<path d="M13 2.5 4.8 13.2H11l-1 8.3 8.2-10.7H12l1-8.3Z"/>',
  gauge: '<path d="M3.5 18a8.5 8.5 0 1 1 17 0"/><path d="m12 14 4-4.5"/><circle cx="12" cy="18" r="1"/>',
  crosshair:
    '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4"/><path d="M12 17.5v4"/><path d="M2.5 12h4"/><path d="M17.5 12h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="m4.8 4.8 1.4 1.4"/><path d="m17.8 17.8 1.4 1.4"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m6.2 17.8-1.4 1.4"/><path d="m19.2 4.8-1.4 1.4"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.7 6.7 0 0 0 9.7 9.7Z"/>',
  auto: '<rect x="3" y="4.5" width="18" height="12" rx="2.5"/><path d="M8 20h8"/><path d="M12 16.5V20"/>',
  wifi: '<path d="M2.5 9.2a14 14 0 0 1 19 0"/><path d="M5.8 12.6a9.5 9.5 0 0 1 12.4 0"/><path d="M9 16a5.5 5.5 0 0 1 6 0"/><circle cx="12" cy="19.3" r="1"/>',
  'wifi-off':
    '<path d="M3 3 21 21"/><path d="M8.2 8.4A13.6 13.6 0 0 1 21.5 9.2"/><path d="M5.8 12.6a9.6 9.6 0 0 1 4.1-2.3"/><path d="M9.3 16.1A5.5 5.5 0 0 1 15 16"/><circle cx="12" cy="19.3" r="1"/>',
  alert: '<path d="M12 3.5 21.6 20H2.4L12 3.5Z"/><path d="M12 9.5v4.5"/><path d="M12 17.3h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.2v5"/><path d="M12 7.8h.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  'check-circle':
    '<circle cx="12" cy="12" r="8.5"/><path d="m8 12 2.8 2.8L16.5 9"/>',
  'x-circle':
    '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>',
  undo: '<path d="M9 7.5 4.5 12 9 16.5"/><path d="M4.5 12h9.5a5.5 5.5 0 0 1 5.5 5.5v1"/>',
  save: '<path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  layers: '<path d="m12 3.5 8.5 4.7L12 13 3.5 8.2 12 3.5Z"/><path d="m3.5 13 8.5 4.7 8.5-4.7"/>',
  route:
    '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H14a3.5 3.5 0 0 0 0-7H10a3 3 0 0 1 0-6h5.5"/>',
  tag: '<path d="M3.5 3.5h7.8l9.2 9.2-7.8 7.8-9.2-9.2V3.5Z"/><circle cx="8" cy="8" r="1.4"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9.2 3.5v17"/><path d="M14.8 3.5v17"/><path d="M3.5 9.2h17"/><path d="M3.5 14.8h17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7 7.5 20h9l1-13"/><path d="M10.5 11v5"/><path d="M13.5 11v5"/>',
  server:
    '<rect x="3.5" y="4" width="17" height="7" rx="2.5"/><rect x="3.5" y="13" width="17" height="7" rx="2.5"/><path d="M7.2 7.5h.01"/><path d="M7.2 16.5h.01"/>',
  'arrow-right': '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  battery: '<rect x="2.5" y="7.5" width="17" height="9" rx="2.5"/><path d="M21.5 11v2"/><path d="M6 10.5v3"/>',
  filter: '<path d="M4 5.5h16l-6.2 7.2V19l-3.6 1.6v-7.9L4 5.5Z"/>',
  pin: '<path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/>',
}

const markup = computed(() => {
  const inner = ICONS[props.name] ?? ICONS.info
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${props.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`
})

const boxSize = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
)
</script>

<template>
  <span class="icon" :style="{ width: boxSize, height: boxSize }" v-html="markup" />
</template>

<style scoped>
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  line-height: 0;
  color: inherit;
}

.icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
