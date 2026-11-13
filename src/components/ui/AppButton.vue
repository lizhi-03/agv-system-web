<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'tint'
    size?: 'sm' | 'md'
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
    block?: boolean
    iconOnly?: boolean
    title?: string
  }>(),
  { variant: 'secondary', size: 'md', type: 'button', disabled: false, loading: false },
)

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    :class="['btn', `btn-${variant}`, `btn-${size}`, { 'btn-block': block, 'btn-icon': iconOnly }]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :title="title"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot v-else />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  user-select: none;
  transition:
    background-color var(--dur) var(--ease),
    transform var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    color var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-md {
  height: 36px;
  padding: 0 18px;
  font-size: 13.5px;
}

.btn-sm {
  height: 30px;
  padding: 0 13px;
  font-size: 12.5px;
  gap: 5px;
}

.btn-icon.btn-md {
  width: 36px;
  padding: 0;
}

.btn-icon.btn-sm {
  width: 30px;
  padding: 0;
}

.btn-primary {
  background: var(--accent);
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-secondary {
  background: var(--surface-subtle);
  color: var(--text);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--surface-hover);
}

.btn-ghost {
  background: transparent;
  color: var(--accent);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--accent-tint);
}

.btn-tint {
  background: var(--accent-tint);
  color: var(--accent);
}

.btn-tint:hover:not(:disabled) {
  background: var(--accent-tint);
  filter: brightness(1.04);
}

.btn-danger {
  background: var(--red);
  color: #ffffff;
}

.btn-danger:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-block {
  width: 100%;
}

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: btn-spin 0.7s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
