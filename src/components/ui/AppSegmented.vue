<script setup lang="ts">
import Icon from './Icon.vue'

interface SegmentedOption {
  value: string
  label: string
  icon?: string
  disabled?: boolean
}
withDefaults(
  defineProps<{
    modelValue: string
    options: SegmentedOption[]
    size?: 'sm' | 'md'
    block?: boolean
  }>(),
  { size: 'md', block: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div :class="['segmented', `seg-${size}`, { block }]" role="group">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="['seg-item', { active: option.value === modelValue }]"
      :disabled="option.disabled"
      :aria-pressed="option.value === modelValue"
      @click="emit('update:modelValue', option.value)"
    >
      <Icon v-if="option.icon" :name="option.icon" :size="size === 'sm' ? 13 : 14" />
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--control-bg);
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.segmented::-webkit-scrollbar {
  display: none;
}

.segmented.block {
  display: flex;
  width: 100%;
}

.segmented.block .seg-item {
  flex: 1;
  justify-content: center;
}

.seg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border-radius: 11px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}

.seg-sm .seg-item {
  height: 24px;
  padding: 0 9px;
  font-size: 11.5px;
  border-radius: 9px;
}

.seg-item:hover:not(:disabled):not(.active) {
  color: var(--text);
}

.seg-item.active {
  background: var(--seg-active-bg);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08);
}

.seg-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
