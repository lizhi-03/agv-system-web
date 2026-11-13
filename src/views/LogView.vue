<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppInput from '../components/ui/AppInput.vue'
import AppPagination from '../components/ui/AppPagination.vue'
import AppSegmented from '../components/ui/AppSegmented.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppTable from '../components/ui/AppTable.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { pageLogs } from '../api/log'
import { usePolling } from '../composables/usePolling'
import type { AgvLog } from '../types'
import { formatTime } from '../utils/labels'

const rows = ref<AgvLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const level = ref('all')
const keyword = ref('')
const loading = ref(true)
const errorText = ref('')

async function load(): Promise<void> {
  try {
    const result = await pageLogs({ page: page.value, pageSize: pageSize.value }, true)
    rows.value = result.records
    total.value = result.total
    errorText.value = ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '日志加载失败'
    throw error
  } finally {
    loading.value = false
  }
}

const poller = usePolling(load, { interval: 3000, enabled: false })
const { running, refresh, inFlight } = poller

onMounted(() => {
  void load().catch(() => {})
})

const LEVEL_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '错误' },
]

const filtered = computed(() => {
  const word = keyword.value.trim().toLowerCase()
  return rows.value.filter((item) => {
    if (level.value !== 'all' && item.level !== level.value) return false
    if (!word) return true
    return (
      (item.message ?? '').toLowerCase().includes(word) ||
      (item.level ?? '').toLowerCase().includes(word)
    )
  })
})

const hasFilter = computed(() => level.value !== 'all' || Boolean(keyword.value.trim()))

function onPagerChange(payload: { page: number; pageSize: number }): void {
  page.value = payload.page
  pageSize.value = payload.pageSize
  void load().catch(() => {})
}

function clearFilters(): void {
  level.value = 'all'
  keyword.value = ''
}

const pageSizeOptions = [
  { value: '10', label: '每页 10 条' },
  { value: '20', label: '每页 20 条' },
  { value: '50', label: '每页 50 条' },
]

function onPageSizeChange(value: string): void {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return
  pageSize.value = size
  page.value = 1
  void load().catch(() => {})
}
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" :loading="inFlight" @click="refresh">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
  </Teleport>

  <div class="page">
    <div class="toolbar">
      <AppSegmented v-model="level" :options="LEVEL_OPTIONS" size="sm" />
      <AppInput
        v-model="keyword"
        placeholder="当前页关键字过滤"
        icon="search"
        size="sm"
        clearable
        class="search-input"
      />
      <AppSelect
        :model-value="String(pageSize)"
        :options="pageSizeOptions"
        size="sm"
        aria-label="每页条数"
        @update:model-value="onPageSizeChange"
      />
      <AppButton v-if="hasFilter" size="sm" variant="secondary" @click="clearFilters">
        <Icon name="close" :size="13" />
        清除筛选
      </AppButton>
      <span class="toolbar-spacer" />
      <span class="filter-hint num">本页 {{ rows.length }} 条 · 筛选后 {{ filtered.length }} 条</span>
      <AppSwitch v-model="running" size="sm" label="自动刷新（3s）" />
    </div>

    <AppCard title="系统日志" :subtitle="`共 ${total} 条 · 服务端分页，级别与关键字仅在当前页过滤`" padding="sm">
      <div v-if="loading && !rows.length" class="table-skeleton">
        <SkeletonBlock v-for="index in 8" :key="index" height="42px" radius="10px" />
      </div>

      <EmptyState
        v-else-if="errorText && !rows.length"
        title="无法加载系统日志"
        :description="`${errorText}。请确认后端服务已启动后重试。`"
      >
        <AppButton variant="primary" @click="refresh">
          <Icon name="refresh" :size="14" />
          重试
        </AppButton>
      </EmptyState>

      <EmptyState
        v-else-if="!filtered.length"
        :title="hasFilter ? '没有匹配的日志' : '暂无日志'"
        :description="
          hasFilter
            ? '服务端不支持过滤，级别与关键字只在当前页内匹配；可清除筛选或翻页查看。'
            : '后端产生日志后会显示在这里。'
        "
      >
        <AppButton v-if="hasFilter" size="sm" variant="secondary" @click="clearFilters">
          清除筛选
        </AppButton>
      </EmptyState>

      <template v-else>
        <AppTable>
          <thead>
            <tr>
              <th class="id-col">ID</th>
              <th class="time-col">时间</th>
              <th class="level-col">级别</th>
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filtered" :key="item.logId">
              <td class="num muted">#{{ item.logId }}</td>
              <td class="num nowrap">{{ formatTime(item.timestamp) }}</td>
              <td><StatusPill :status="item.level" kind="log" /></td>
              <td class="log-message">{{ item.message || '—' }}</td>
            </tr>
          </tbody>
        </AppTable>
        <div class="paged">
          <AppPagination
            :total="total"
            :page="page"
            :page-size="pageSize"
            :page-sizes="[10, 20, 50]"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @change="onPagerChange"
          />
        </div>
      </template>
    </AppCard>
  </div>
</template>

<style scoped>
.search-input {
  width: 240px;
}

.filter-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.id-col {
  width: 80px;
}

.time-col {
  width: 180px;
}

.level-col {
  width: 90px;
}

.nowrap {
  white-space: nowrap;
}

.log-message {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.55;
  word-break: break-word;
  min-width: 260px;
}

@media (max-width: 768px) {
  .search-input {
    width: 100%;
  }
}
</style>
