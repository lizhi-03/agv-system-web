<script setup lang="ts">
import Icon from './Icon.vue'

withDefaults(
  defineProps<{
    modelValue: string
    options: { value: string; label: string; disabled?: boolean }[]
    placeholder?: string
    size?: 'sm' | 'md'
    disabled?: boolean
    ariaLabel?: string
  }>(),
  { size: 'md', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div :class="['select-wrap', `size-${size}`]">
    <select
      :value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel || placeholder"
      @change="onChange"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <Icon name="chevron-down" :size="13" class="select-chevron" />
  </div>
</template>

<style scoped>
.select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 120px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  border: 1px solid transparent;
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}

.select-wrap.size-sm {
  height: 30px;
  min-width: 96px;
}

.select-wrap:focus-within {
  background: var(--control-bg-focus);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-ring);
}

.select-wrap select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 100%;
  padding: 0 30px 0 12px;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}

.size-sm select {
  padding: 0 26px 0 10px;
  font-size: 12.5px;
}

.select-chevron {
  position: absolute;
  right: 11px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.size-sm .select-chevron {
  right: 9px;
}

.select-wrap select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
