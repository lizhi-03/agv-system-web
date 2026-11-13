<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    size?: 'sm' | 'md'
    disabled?: boolean
    ariaLabel?: string
  }>(),
  { min: 0, max: 1000, step: 1, size: 'md', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const text = ref(String(props.modelValue))

watch(
  () => props.modelValue,
  (value) => {
    if (Number(text.value) !== value) text.value = String(value)
  },
)

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, Math.round(value)))
}

function commit(value: number): void {
  const next = clamp(value)
  text.value = String(next)
  if (next !== props.modelValue) emit('update:modelValue', next)
}

function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  text.value = raw
  if (raw === '') return
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed >= props.min && parsed <= props.max) {
    emit('update:modelValue', parsed)
  }
}

function onBlur(): void {
  const parsed = Number(text.value)
  commit(Number.isFinite(parsed) ? parsed : props.min)
}

function stepBy(delta: number): void {
  if (props.disabled) return
  commit(props.modelValue + delta * props.step)
}
</script>

<template>
  <div :class="['number-field', `size-${size}`, { disabled }]">
    <button
      type="button"
      class="step-btn"
      :disabled="disabled || modelValue <= min"
      aria-label="减小"
      @click="stepBy(-1)"
    >
      <Icon name="minus" :size="12" />
    </button>
    <input
      :value="text"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @input="onInput"
      @blur="onBlur"
      @keydown.enter="onBlur"
    />
    <button
      type="button"
      class="step-btn"
      :disabled="disabled || modelValue >= max"
      aria-label="增大"
      @click="stepBy(1)"
    >
      <Icon name="plus" :size="12" />
    </button>
  </div>
</template>

<style scoped>
.number-field {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  border: 1px solid transparent;
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}

.number-field.size-sm {
  height: 30px;
}

.number-field:focus-within {
  background: var(--control-bg-focus);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-ring);
}

.number-field.disabled {
  opacity: 0.55;
}

.step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: var(--text-secondary);
  flex: none;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.size-sm .step-btn {
  width: 22px;
  height: 22px;
}

.step-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}

.step-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.number-field input {
  width: 48px;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  text-align: center;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.size-sm .number-field input {
  width: 40px;
  font-size: 12.5px;
}
</style>
