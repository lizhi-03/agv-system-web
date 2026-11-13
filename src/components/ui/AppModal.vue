<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import AppButton from './AppButton.vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    subtitle?: string
    width?: number | string
    dismissible?: boolean
    danger?: boolean
    confirmLabel?: string
    cancelLabel?: string
    loading?: boolean
    showFooter?: boolean
  }>(),
  {
    width: 440,
    dismissible: true,
    danger: false,
    confirmLabel: '确认',
    cancelLabel: '取消',
    loading: false,
    showFooter: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
  close: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let lastActive: HTMLElement | null = null
let previousOverflow = ''
let locked = false

const widthStyle = computed(() =>
  typeof props.width === 'number' ? `${props.width}px` : props.width,
)

function close(): void {
  emit('update:modelValue', false)
  emit('close')
}

function onCancel(): void {
  emit('cancel')
  close()
}

function onBackdrop(): void {
  if (props.dismissible) close()
}

function trapFocus(event: KeyboardEvent): void {
  const root = dialogRef.value
  if (!root) return
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null,
  )
  if (nodes.length === 0) {
    event.preventDefault()
    root.focus()
    return
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (props.dismissible) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    return
  }
  if (event.key === 'Tab') trapFocus(event)
}

function lockScroll(): void {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKeydown, true)
  locked = true
}

function unlockScroll(): void {
  if (!locked) return
  document.body.style.overflow = previousOverflow
  document.removeEventListener('keydown', onKeydown, true)
  locked = false
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      lastActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
      lockScroll()
      await nextTick()
      const root = dialogRef.value
      if (!root) return
      const autofocus = root.querySelector<HTMLElement>('[data-autofocus]')
      const first = root.querySelector<HTMLElement>(FOCUSABLE)
      ;(autofocus ?? first ?? root).focus()
    } else {
      unlockScroll()
      const target = lastActive
      lastActive = null
      target?.focus?.()
    }
  },
)

onUnmounted(unlockScroll)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-layer" @click.self="onBackdrop">
        <div
          ref="dialogRef"
          class="modal-card"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '对话框'"
          tabindex="-1"
          :style="{ width: widthStyle }"
        >
          <header v-if="title || $slots.header" class="modal-head">
            <div class="modal-titles">
              <slot name="header">
                <h2>{{ title }}</h2>
                <p v-if="subtitle">{{ subtitle }}</p>
              </slot>
            </div>
            <button
              v-if="dismissible"
              type="button"
              class="modal-close"
              aria-label="关闭"
              @click="close"
            >
              <Icon name="close" :size="15" />
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer || showFooter" class="modal-foot">
            <slot name="footer">
              <AppButton variant="secondary" @click="onCancel">{{ cancelLabel }}</AppButton>
              <AppButton
                :variant="danger ? 'danger' : 'primary'"
                :loading="loading"
                @click="emit('confirm')"
              >
                {{ confirmLabel }}
              </AppButton>
            </slot>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-layer {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
}

.modal-card {
  max-width: 100%;
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-modal);
  outline: none;
  transform-origin: center;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 24px 0;
}

.modal-titles h2 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.modal-titles p {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.modal-close:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.modal-body {
  padding: 18px 24px 6px;
  overflow-y: auto;
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 18px 24px 22px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.22s var(--ease);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-card,
.modal-leave-active .modal-card {
  transition: transform 0.28s var(--ease), opacity 0.22s var(--ease);
}

.modal-enter-from .modal-card,
.modal-leave-to .modal-card {
  transform: scale(0.955) translateY(10px);
  opacity: 0;
}
</style>
