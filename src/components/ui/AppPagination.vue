<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    total: number
    page: number
    pageSize: number
    pageSizes?: number[]
    showSizes?: boolean
    showTotal?: boolean
    disabled?: boolean
  }>(),
  {
    pageSizes: () => [10, 20, 50],
    showSizes: true,
    showTotal: true,
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [size: number]
  change: [payload: { page: number; pageSize: number }]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const pages = computed<(number | 'gap')[]>(() => {
  const list: (number | 'gap')[] = []
  for (let p = 1; p <= pageCount.value; p += 1) {
    if (p === 1 || p === pageCount.value || Math.abs(p - props.page) <= 1) {
      list.push(p)
    } else if (list[list.length - 1] !== 'gap') {
      list.push('gap')
    }
  }
  return list
})

function go(page: number): void {
  if (props.disabled) return
  const target = Math.min(pageCount.value, Math.max(1, page))
  if (target === props.page) return
  emit('update:page', target)
  emit('change', { page: target, pageSize: props.pageSize })
}

function onSizeChange(event: Event): void {
  if (props.disabled) return
  const size = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(size) || size <= 0) return
  emit('update:pageSize', size)
  emit('update:page', 1)
  emit('change', { page: 1, pageSize: size })
}
</script>

<template>
  <div class="pagination">
    <div class="pagination-info">
      <span v-if="showTotal" class="total num">共 {{ total }} 条</span>
      <label v-if="showSizes" class="size-select">
        <span>每页</span>
        <select :value="pageSize" :disabled="disabled" aria-label="每页条数" @change="onSizeChange">
          <option v-for="size in pageSizes" :key="size" :value="size">{{ size }}</option>
        </select>
        <span>条</span>
      </label>
    </div>
    <div class="pagination-nav">
      <button
        type="button"
        class="page-btn"
        :disabled="disabled || page <= 1"
        aria-label="上一页"
        @click="go(page - 1)"
      >
        <Icon name="chevron-left" :size="14" />
      </button>
      <template v-for="(item, index) in pages" :key="`${item}-${index}`">
        <span v-if="item === 'gap'" class="page-gap">…</span>
        <button
          v-else
          type="button"
          class="page-btn num"
          :class="{ active: item === page }"
          :disabled="disabled"
          :aria-current="item === page ? 'page' : undefined"
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        type="button"
        class="page-btn"
        :disabled="disabled || page >= pageCount"
        aria-label="下一页"
        @click="go(page + 1)"
      >
        <Icon name="chevron-right" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--text-secondary);
}

.total {
  color: var(--text-tertiary);
}

.size-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.size-select select {
  appearance: none;
  -webkit-appearance: none;
  height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  border: none;
  background: var(--control-bg);
  color: var(--text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  outline: none;
}

.pagination-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border-radius: 9px;
  font-size: 12.5px;
  color: var(--text-secondary);
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}

.page-btn:hover:not(:disabled):not(.active) {
  background: var(--surface-subtle);
  color: var(--text);
}

.page-btn.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.page-gap {
  min-width: 22px;
  text-align: center;
  color: var(--text-tertiary);
  user-select: none;
}
</style>
