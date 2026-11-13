<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    ariaLabel?: string
  }>(),
  { min: 0, max: 100, step: 1, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  const value = Math.min(props.max, Math.max(props.min, props.modelValue))
  return ((value - props.min) / range) * 100
})

function onInput(event: Event): void {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="slider" :style="{ '--slider-percent': `${percent}%` }">
    <input
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  align-items: center;
  width: 100%;
}

.slider input[type='range'] {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: var(--radius-pill);
  outline: none;
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--slider-percent),
    var(--separator-strong) var(--slider-percent),
    var(--separator-strong) 100%
  );
  cursor: pointer;
}

.slider input[type='range']::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: transform var(--dur) var(--ease);
}

.slider input[type='range']::-webkit-slider-thumb:hover {
  transform: scale(1.06);
}

.slider input[type='range']::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
}

.slider input[type='range']:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
