<script setup lang="ts">
import { computed } from 'vue'
import { batteryTone } from '../../utils/labels'

const props = withDefaults(
  defineProps<{
    value: number
    showLabel?: boolean
    width?: string
  }>(),
  { showLabel: true, width: '64px' },
)

const clamped = computed(() => Math.max(0, Math.min(100, Number.isFinite(props.value) ? props.value : 0)))
const tone = computed(() => batteryTone(clamped.value))
</script>

<template>
  <span class="battery">
    <span class="battery-track" :data-tone="tone" :style="{ width }">
      <span class="battery-fill" :style="{ width: `${clamped}%` }" />
    </span>
    <span v-if="showLabel" class="battery-value num">{{ Math.round(clamped) }}%</span>
  </span>
</template>

<style scoped>
.battery {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.battery-track {
  display: block;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  overflow: hidden;
  flex: none;
}

.battery-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--blue);
  transition: width 0.4s var(--ease), background-color var(--dur) var(--ease);
}

.battery-track[data-tone='green'] .battery-fill {
  background: var(--green);
}

.battery-track[data-tone='orange'] .battery-fill {
  background: var(--orange);
}

.battery-track[data-tone='red'] .battery-fill {
  background: var(--red);
}

.battery-value {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 34px;
  text-align: right;
}
</style>
