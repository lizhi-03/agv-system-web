<script setup lang="ts">
import { confirmState, resolveConfirm } from '../../composables/useConfirm'
import AppModal from './AppModal.vue'

function onOpen(value: boolean): void {
  if (!value) resolveConfirm(false)
}
</script>

<template>
  <AppModal
    :model-value="confirmState.open"
    :title="confirmState.title"
    :width="400"
    :danger="confirmState.danger"
    :confirm-label="confirmState.confirmLabel"
    :cancel-label="confirmState.cancelLabel"
    @update:model-value="onOpen"
    @confirm="resolveConfirm(true)"
    @cancel="resolveConfirm(false)"
    @close="resolveConfirm(false)"
  >
    <p class="confirm-message">{{ confirmState.message }}</p>
    <p v-if="confirmState.detail" class="confirm-detail">{{ confirmState.detail }}</p>
  </AppModal>
</template>

<style scoped>
.confirm-message {
  font-size: 13.5px;
  color: var(--text);
  line-height: 1.6;
  word-break: break-word;
}

.confirm-detail {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-subtle);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
