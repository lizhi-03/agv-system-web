<script setup lang="ts">
import { toastState, dismissToast, type ToastTone } from '../../composables/useToast'
import Icon from './Icon.vue'

const toneIcon: Record<ToastTone, string> = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'alert',
  info: 'info',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="item in toastState.items"
          :key="item.id"
          class="toast"
          :data-tone="item.tone"
        >
          <span class="toast-icon">
            <Icon :name="toneIcon[item.tone]" :size="17" />
          </span>
          <div class="toast-main">
            <p class="toast-title">{{ item.title }}</p>
            <p v-if="item.message" class="toast-message">{{ item.message }}</p>
          </div>
          <button type="button" class="toast-close" aria-label="关闭提示" @click="dismissToast(item.id)">
            <Icon name="close" :size="12" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 340px;
  max-width: calc(100vw - 36px);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--surface-glass);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card-hover);
  pointer-events: auto;
}

.toast-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  flex: none;
  background: var(--blue-tint);
  color: var(--blue-text);
}

.toast[data-tone='success'] .toast-icon {
  background: var(--green-tint);
  color: var(--green-text);
}

.toast[data-tone='error'] .toast-icon {
  background: var(--red-tint);
  color: var(--red-text);
}

.toast[data-tone='warning'] .toast-icon {
  background: var(--orange-tint);
  color: var(--orange-text);
}

.toast-main {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}

.toast-message {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.toast-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--text-tertiary);
  flex: none;
}

.toast-close:hover {
  background: var(--surface-subtle);
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.24s var(--ease), transform 0.24s var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.toast-move {
  transition: transform 0.24s var(--ease);
}
</style>
