<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    padding?: 'none' | 'sm' | 'md'
    hover?: boolean
  }>(),
  { padding: 'md', hover: false },
)

const slots = useSlots()
const hasHeader = computed(
  () => Boolean(props.title || props.subtitle || slots.header || slots.actions),
)
</script>

<template>
  <section :class="['card', `pad-${padding}`, { 'card-hover': hover, 'has-head': hasHeader }]">
    <header v-if="hasHeader" class="card-head">
      <div class="card-titles">
        <slot name="header">
          <h2 v-if="title">{{ title }}</h2>
          <p v-if="subtitle">{{ subtitle }}</p>
        </slot>
      </div>
      <div v-if="slots.actions" class="card-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="card-body">
      <slot />
    </div>
    <footer v-if="slots.footer" class="card-foot">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition:
    box-shadow var(--dur) var(--ease),
    transform var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}

.card-hover:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-card-hover);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 0;
}

.card-titles {
  min-width: 0;
}

.card-titles h2 {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}

.card-titles p {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pad-md .card-body {
  padding: 20px;
}

.pad-sm .card-body {
  padding: 12px 16px 16px;
}

.pad-none .card-body {
  padding: 0;
}

.has-head.pad-md .card-body {
  padding-top: 14px;
}

.has-head.pad-sm .card-body {
  padding-top: 10px;
}

.has-head.pad-none .card-body {
  padding-top: 0;
}

.has-head.pad-none .card-head {
  padding-bottom: 14px;
}

.card-foot {
  padding: 14px 20px 18px;
  border-top: 1px solid var(--separator);
}
</style>
