<script setup lang="ts">
import { computed } from 'vue'
import { agvStatusMeta, logLevelMeta, priorityMeta, taskStatusMeta, type Tone } from '../../utils/labels'

const props = withDefaults(
  defineProps<{
    status?: string | null
    kind?: 'agv' | 'task' | 'log' | 'priority' | 'custom'
    label?: string
    tone?: Tone
    dot?: boolean
  }>(),
  { kind: 'custom', dot: true },
)

const meta = computed<{ text: string; tone: Tone }>(() => {
  if (props.tone && props.label) return { text: props.label, tone: props.tone }
  const status = props.status ?? ''
  let base: { text: string; tone: Tone }
  switch (props.kind) {
    case 'agv':
      base = agvStatusMeta(status)
      break
    case 'task':
      base = taskStatusMeta(status)
      break
    case 'log':
      base = logLevelMeta(status)
      break
    case 'priority':
      base = priorityMeta(status)
      break
    default:
      base = { text: status || '—', tone: 'gray' }
  }
  return { text: props.label ?? base.text, tone: props.tone ?? base.tone }
})
</script>

<template>
  <span class="pill" :data-tone="meta.tone">
    <i v-if="dot" class="pill-dot" aria-hidden="true" />
    {{ meta.text }}
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  background: var(--gray-tint);
  color: var(--gray-text);
}

.pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}

.pill[data-tone='blue'] {
  background: var(--blue-tint);
  color: var(--blue-text);
}

.pill[data-tone='green'] {
  background: var(--green-tint);
  color: var(--green-text);
}

.pill[data-tone='orange'] {
  background: var(--orange-tint);
  color: var(--orange-text);
}

.pill[data-tone='red'] {
  background: var(--red-tint);
  color: var(--red-text);
}

.pill[data-tone='purple'] {
  background: var(--purple-tint);
  color: var(--purple-text);
}

.pill[data-tone='teal'] {
  background: var(--teal-tint);
  color: var(--teal-text);
}
</style>
