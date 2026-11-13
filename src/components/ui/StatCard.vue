<script setup lang="ts">
import Icon from './Icon.vue'
import type { Tone } from '../../utils/labels'

withDefaults(
  defineProps<{
    label: string
    value: string | number
    unit?: string
    icon?: string
    tone?: Tone
    hint?: string
    loading?: boolean
  }>(),
  { tone: 'blue', loading: false },
)
</script>

<template>
  <article class="stat-card">
    <template v-if="loading">
      <span class="skeleton sk-label" />
      <span class="skeleton sk-value" />
      <span class="skeleton sk-hint" />
    </template>
    <template v-else>
      <div class="stat-top">
        <span class="stat-label">{{ label }}</span>
        <span v-if="icon" class="stat-icon" :data-tone="tone"><Icon :name="icon" :size="15" /></span>
      </div>
      <div class="stat-value num">
        {{ value }}<span v-if="unit" class="stat-unit">{{ unit }}</span>
      </div>
      <div class="stat-hint">
        <slot name="hint">{{ hint }}</slot>
      </div>
    </template>
  </article>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition:
    transform var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}

.stat-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-card-hover);
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--blue-tint);
  color: var(--blue-text);
  flex: none;
}

.stat-icon[data-tone='green'] {
  background: var(--green-tint);
  color: var(--green-text);
}

.stat-icon[data-tone='orange'] {
  background: var(--orange-tint);
  color: var(--orange-text);
}

.stat-icon[data-tone='red'] {
  background: var(--red-tint);
  color: var(--red-text);
}

.stat-icon[data-tone='purple'] {
  background: var(--purple-tint);
  color: var(--purple-text);
}

.stat-icon[data-tone='teal'] {
  background: var(--teal-tint);
  color: var(--teal-text);
}

.stat-icon[data-tone='gray'] {
  background: var(--gray-tint);
  color: var(--gray-text);
}

.stat-value {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: var(--text);
}

.stat-unit {
  margin-left: 3px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-tertiary);
  letter-spacing: 0;
}

.stat-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  min-height: 16px;
}

.sk-label {
  width: 64px;
  height: 12px;
}

.sk-value {
  width: 88px;
  height: 28px;
}

.sk-hint {
  width: 110px;
  height: 11px;
}
</style>
