<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    subtitle?: string
    width?: number
    dismissible?: boolean
  }>(),
  { width: 440, dismissible: true },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
let lastActive: HTMLElement | null = null
let previousOverflow = ''
let locked = false

const widthStyle = computed(() => `${props.width}px`)

function close(): void {
  emit('update:modelValue', false)
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.dismissible) {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
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
      const panel = panelRef.value
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
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
    <Transition name="drawer">
      <div v-if="modelValue" class="drawer-layer" @click.self="dismissible && close()">
        <aside
          ref="panelRef"
          class="drawer-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '详情'"
          tabindex="-1"
          :style="{ width: widthStyle }"
        >
          <header class="drawer-head">
            <div>
              <h2>{{ title }}</h2>
              <p v-if="subtitle">{{ subtitle }}</p>
            </div>
            <button type="button" class="drawer-close" aria-label="关闭" @click="close">
              <Icon name="close" :size="15" />
            </button>
          </header>
          <div class="drawer-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="drawer-foot">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
}

.drawer-panel {
  max-width: 92vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--card-border);
  border-radius: var(--radius-xl) 0 0 var(--radius-xl);
  box-shadow: var(--shadow-modal);
  outline: none;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--separator);
}

.drawer-head h2 {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.drawer-head p {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  flex: none;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.drawer-close:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
  border-top: 1px solid var(--separator);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.24s var(--ease);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.3s var(--ease);
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(32px);
}
</style>
