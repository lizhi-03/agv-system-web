<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    content?: string
    placement?: 'top' | 'bottom'
  }>(),
  { content: '', placement: 'top' },
)

const anchorRef = ref<HTMLElement | null>(null)
const tipRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const left = ref(0)
const top = ref(0)

function measure(): void {
  const anchor = anchorRef.value
  const tip = tipRef.value
  if (!anchor || !tip) return
  const rect = anchor.getBoundingClientRect()
  const margin = 8
  const gap = 8
  const tipWidth = tip.offsetWidth
  const tipHeight = tip.offsetHeight
  let x = rect.left + rect.width / 2 - tipWidth / 2
  x = Math.min(Math.max(margin, x), window.innerWidth - tipWidth - margin)
  let y = props.placement === 'bottom' ? rect.bottom + gap : rect.top - tipHeight - gap
  if (props.placement === 'top' && y < margin) y = rect.bottom + gap
  if (y + tipHeight > window.innerHeight - margin) {
    y = Math.max(margin, rect.top - tipHeight - gap)
  }
  left.value = x
  top.value = y
}

function show(): void {
  if (!props.content) return
  visible.value = true
  void nextTick(measure)
}

function hide(): void {
  visible.value = false
}

function onViewportChange(): void {
  if (visible.value) hide()
}

onMounted(() => {
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})
</script>

<template>
  <span
    ref="anchorRef"
    class="tip-anchor"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
  </span>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible && content"
        ref="tipRef"
        class="app-tip"
        role="tooltip"
        :style="{ left: `${left}px`, top: `${top}px` }"
      >
        {{ content }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tip-anchor {
  display: inline-flex;
}

.app-tip {
  position: fixed;
  z-index: 2600;
  width: max-content;
  max-width: 260px;
  padding: 6px 9px;
  border-radius: 8px;
  background: var(--tooltip-bg);
  color: var(--tooltip-text);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  word-break: break-word;
  pointer-events: none;
  box-shadow: var(--shadow-card);
}
</style>
