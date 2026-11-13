<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    compact?: boolean
  }>(),
  { compact: false },
)
</script>

<template>
  <div class="empty" :class="{ compact }">
    <div class="empty-art" aria-hidden="true">
      <svg viewBox="0 0 120 84" fill="none">
        <rect x="12" y="10" width="96" height="64" rx="12" fill="var(--surface-subtle)" />
        <rect
          x="12.5"
          y="10.5"
          width="95"
          height="63"
          rx="11.5"
          stroke="var(--separator)"
        />
        <path
          d="M30 56h18M48 56V34h24M72 34v16h16"
          stroke="var(--separator-strong)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-dasharray="3 5"
        />
        <rect x="22" y="49" width="16" height="12" rx="4" fill="var(--accent)" opacity="0.85" />
        <circle cx="88" cy="50" r="4.5" fill="var(--accent)" opacity="0.9" />
        <circle cx="72" cy="34" r="3.5" fill="var(--orange)" opacity="0.9" />
        <path d="M24 61h12" stroke="var(--map-bg)" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 24px;
  text-align: center;
}

.empty.compact {
  padding: 24px 16px;
  gap: 6px;
}

.empty-art {
  width: 120px;
  height: 84px;
  margin-bottom: 4px;
}

.empty-art svg {
  width: 100%;
  height: 100%;
}

.empty h3 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}

.empty p {
  max-width: 380px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.empty.compact .empty-art {
  width: 76px;
  height: 54px;
}
</style>
