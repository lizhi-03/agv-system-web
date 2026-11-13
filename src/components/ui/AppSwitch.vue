<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    disabled?: boolean
    size?: 'sm' | 'md'
  }>(),
  { disabled: false, size: 'md' },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <div :class="['switch-wrap', `size-${size}`]">
    <span v-if="label" class="switch-label">{{ label }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label || '切换'"
      :disabled="disabled"
      :class="['switch', { on: modelValue }]"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="switch-thumb" />
    </button>
  </div>
</template>

<style scoped>
.switch-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.switch-label {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.switch {
  position: relative;
  width: 40px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--separator-strong);
  flex: none;
  transition: background-color 0.24s var(--ease);
}

.size-sm .switch {
  width: 34px;
  height: 20px;
}

.switch.on {
  background: var(--green);
}

.switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
  transition: transform 0.24s var(--ease);
}

.size-sm .switch-thumb {
  width: 16px;
  height: 16px;
}

.switch.on .switch-thumb {
  transform: translateX(16px);
}

.switch-wrap.size-sm .switch.on .switch-thumb {
  transform: translateX(14px);
}
</style>
