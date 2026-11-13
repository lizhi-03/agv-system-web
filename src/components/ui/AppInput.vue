<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    type?: string
    size?: 'sm' | 'md'
    icon?: string
    clearable?: boolean
    disabled?: boolean
    maxlength?: number
    ariaLabel?: string
  }>(),
  { type: 'text', size: 'md', clearable: false, disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: []
  clear: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function clear(): void {
  emit('update:modelValue', '')
  emit('clear')
  inputRef.value?.focus()
}
</script>

<template>
  <div :class="['field-input', `size-${size}`, { 'has-icon': icon, 'has-clear': clearable }]">
    <Icon v-if="icon" :name="icon" :size="size === 'sm' ? 13 : 15" class="field-icon" />
    <input
      ref="inputRef"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :maxlength="maxlength"
      :aria-label="ariaLabel || placeholder"
      @input="onInput"
      @keydown.enter="emit('enter')"
    />
    <button
      v-if="clearable && modelValue"
      type="button"
      class="clear-btn"
      aria-label="清空"
      @click="clear"
    >
      <Icon name="close" :size="11" />
    </button>
  </div>
</template>

<style scoped>
.field-input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  border: 1px solid transparent;
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}

.field-input.size-sm {
  height: 30px;
  padding: 0 10px;
  gap: 6px;
}

.field-input:focus-within {
  background: var(--control-bg-focus);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-ring);
}

.field-icon {
  color: var(--text-tertiary);
  flex: none;
}

.field-input input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text);
}

.field-input.size-sm input {
  font-size: 12.5px;
}

.field-input input::placeholder {
  color: var(--text-tertiary);
}

.field-input input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--separator-strong);
  color: var(--surface);
  flex: none;
  transition: background-color var(--dur) var(--ease);
}

.clear-btn:hover {
  background: var(--text-tertiary);
}
</style>
