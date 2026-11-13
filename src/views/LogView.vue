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
    const result = await pageLogs(
      {
        page: page.value,
        pageSize: pageSize.value,
        level: level.value === 'all' ? undefined : level.value,
        message: keyword.value.trim() || undefined,
      },
      true,
    )
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

const hasFilter = computed(() => level.value !== 'all' || Boolean(keyword.value.trim()))

function applyFilters(): void {
  page.value = 1
  void load().catch(() => {})
}

function onPagerChange(payload: { page: number; pageSize: number }): void {
  page.value = payload.page
  pageSize.value = payload.pageSize
  void load().catch(() => {})
}

function clearFilters(): void {
  level.value = 'all'
  keyword.value = ''
  applyFilters()
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
      <AppSegmented
        v-model="level"
        :options="LEVEL_OPTIONS"
        size="sm"
        @update:model-value="applyFilters"
      />
      <AppInput
        v-model="keyword"
        placeholder="关键字（服务端模糊匹配）"
        icon="search"
        size="sm"
        clearable
        class="search-input"
        @enter="applyFilters"
        @clear="applyFilters"
      />
      <AppButton size="sm" variant="secondary" @click="applyFilters">
        <Icon name="search" :size="13" />
        查询
      </AppButton>
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
      <span class="filter-hint num">本页 {{ rows.length }} 条 · 服务端筛选</span>
      <AppSwitch v-model="running" size="sm" label="自动刷新（3s）" />
    </div>

    <AppCard title="系统日志" :subtitle="`共 ${total} 条 · 服务端分页与服务端筛选`" padding="sm">
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
        v-else-if="!rows.length"
        :title="hasFilter ? '没有匹配的日志' : '暂无日志'"
        :description="
          hasFilter
            ? '服务端按级别与关键字过滤后没有匹配记录；可清除筛选或更换关键字。'
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
            <tr v-for="item in rows" :key="item.logId">
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
