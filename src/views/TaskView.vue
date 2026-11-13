<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppInput from '../components/ui/AppInput.vue'
import AppModal from '../components/ui/AppModal.vue'
import AppPagination from '../components/ui/AppPagination.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppTable from '../components/ui/AppTable.vue'
import AppTooltip from '../components/ui/AppTooltip.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { clearAllTasks, createPathTask, listAgv } from '../api/agv'
import { getStations } from '../api/map'
import { cancelTask, pageTasks } from '../api/task'
import { confirmDialog } from '../composables/useConfirm'
import { usePolling } from '../composables/usePolling'
import { toast } from '../composables/useToast'
import type { AgvSnapshot, AgvTask, Station } from '../types'
import { agvStatusMeta, formatTime, taskTypeText } from '../utils/labels'

const rows = ref<AgvTask[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(true)
const errorText = ref('')
const taskCodeInput = ref('')
const taskCodeFilter = ref('')
const actionKey = ref<string | null>(null)

const createOpen = ref(false)
const optionsLoading = ref(false)
const optionError = ref('')
const submitting = ref(false)
const agvs = ref<AgvSnapshot[]>([])
const stations = ref<Station[]>([])
const form = reactive({ agvCode: '', startId: '', endId: '' })

async function load(): Promise<void> {
  try {
    const result = await pageTasks(
      {
        page: page.value,
        pageSize: pageSize.value,
        taskCode: taskCodeFilter.value || undefined,
      },
      true,
    )
    rows.value = result.records
    total.value = result.total
    errorText.value = ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '任务列表加载失败'
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

function applySearch(): void {
  taskCodeFilter.value = taskCodeInput.value.trim()
  page.value = 1
  void load().catch(() => {})
}

function clearSearch(): void {
  taskCodeInput.value = ''
  taskCodeFilter.value = ''
  page.value = 1
  void load().catch(() => {})
}

function onPagerChange(payload: { page: number; pageSize: number }): void {
  page.value = payload.page
  pageSize.value = payload.pageSize
  void load().catch(() => {})
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

const agvOptions = computed(() =>
  agvs.value.map((car) => ({
    value: car.agvCode,
    label: `${car.agvCode} · ${agvStatusMeta(car.status).text}`,
  })),
)

const stationOptions = computed(() =>
  stations.value.map((station) => ({
    value: station.id,
    label: `${station.id} (${station.x}, ${station.y})${station.type === 'charge' ? ' · 充电站' : ''}`,
  })),
)

const selectedCar = computed(
  () => agvs.value.find((car) => car.agvCode === form.agvCode) ?? null,
)
const startStation = computed(
  () => stations.value.find((station) => station.id === form.startId) ?? null,
)
const endStation = computed(
  () => stations.value.find((station) => station.id === form.endId) ?? null,
)

async function openCreate(): Promise<void> {
  createOpen.value = true
  optionsLoading.value = true
  optionError.value = ''
  try {
    const [cars, sites] = await Promise.all([listAgv(), getStations()])
    agvs.value = cars
    stations.value = sites
    form.agvCode = cars.find((car) => car.taskId === null)?.agvCode ?? cars[0]?.agvCode ?? ''
    form.startId = sites[0]?.id ?? ''
    form.endId = sites[1]?.id ?? sites[0]?.id ?? ''
  } catch (error) {
    optionError.value = error instanceof Error ? error.message : '车辆或站点加载失败'
  } finally {
    optionsLoading.value = false
  }
}

async function submitCreate(): Promise<void> {
  const car = selectedCar.value
  const start = startStation.value
  const end = endStation.value
  if (!car) {
    toast.warning('请选择执行任务的车辆')
    return
  }
  if (!start || !end) {
    toast.warning('请选择起点与终点站点')
    return
  }
  if (start.id === end.id) {
    toast.warning('起点与终点不能相同')
    return
  }
  submitting.value = true
  try {
    const nodes = await createPathTask({
      agvCode: car.agvCode,
      taskCode: `T${Date.now()}`,
      startPoint: { id: start.id, x: start.x, y: start.y },
      endPoint: { id: end.id, x: end.x, y: end.y },
      currentPoint: { x: car.x, y: car.y },
    })
    toast.success('任务已下发', `规划 ${nodes.length} 个路径点（当前位 → 起点 → 终点）`)
    createOpen.value = false
    page.value = 1
    await load().catch(() => {})
  } catch {
    /* http 层已提示后端错误 */
  } finally {
    submitting.value = false
  }
}

async function onCancelTask(row: AgvTask): Promise<void> {
  if (actionKey.value) return
  actionKey.value = `cancel:${row.taskId}`
  try {
    await cancelTask(row.taskId)
    toast.success('任务已取消', row.taskCode)
    await load().catch(() => {})
  } catch {
    /* http 层已提示 */
  } finally {
    actionKey.value = null
  }
}

async function onClearAll(): Promise<void> {
  const confirmed = await confirmDialog({
    title: '清空全部任务',
    message: '将取消所有车辆当前任务，并把车辆状态重置为空闲。此操作不可撤销。',
    detail: '对应接口：POST /agv/clear',
    confirmLabel: '清空任务',
    danger: true,
  })
  if (!confirmed) return
  if (actionKey.value) return
  actionKey.value = 'clear'
  try {
    await clearAllTasks()
    toast.success('已清空全部任务')
    await load().catch(() => {})
  } catch {
    /* http 层已提示 */
  } finally {
    actionKey.value = null
  }
}

const canCancel = (row: AgvTask): boolean =>
  row.status !== 'completed' && row.status !== 'cancelled' && row.status !== 'failed'
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" :loading="inFlight" @click="refresh">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
    <AppButton size="sm" variant="danger" :loading="actionKey === 'clear'" @click="onClearAll">
      <Icon name="trash" :size="14" />
      清空全部任务
    </AppButton>
    <AppButton size="sm" variant="primary" @click="openCreate">
      <Icon name="plus" :size="14" />
      新建任务
    </AppButton>
  </Teleport>

  <div class="page">
    <div class="toolbar">
      <AppInput
        v-model="taskCodeInput"
        placeholder="搜索任务编号（服务端模糊匹配）"
        icon="search"
        size="sm"
        clearable
        class="search-input"
        @enter="applySearch"
        @clear="clearSearch"
      />
      <AppButton size="sm" variant="secondary" @click="applySearch">
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
      <span class="toolbar-spacer" />
      <AppSwitch v-model="running" size="sm" label="自动刷新（3s）" />
    </div>

    <AppCard title="任务列表" :subtitle="`共 ${total} 条任务 · 服务端分页`" padding="sm">
      <template #actions>
        <span v-if="errorText && rows.length" class="inline-warning">
          <Icon name="alert" :size="13" />
          {{ errorText }}
        </span>
      </template>

      <div v-if="loading && !rows.length" class="table-skeleton">
        <SkeletonBlock v-for="index in 7" :key="index" height="46px" radius="10px" />
      </div>

      <EmptyState
        v-else-if="errorText && !rows.length"
        title="无法加载任务列表"
        :description="`${errorText}。请确认后端服务已启动后重试。`"
      >
        <AppButton variant="primary" @click="refresh">
          <Icon name="refresh" :size="14" />
          重试
        </AppButton>
      </EmptyState>

      <EmptyState
        v-else-if="!rows.length"
        :title="taskCodeFilter ? '没有匹配的任务' : '暂无任务'"
        :description="
          taskCodeFilter
            ? `没有任务编号包含「${taskCodeFilter}」的记录。`
            : '点击右上角“新建任务”，选择车辆与起终点后即可下发。'
        "
      >
        <AppButton v-if="taskCodeFilter" size="sm" variant="secondary" @click="clearSearch">
          清除筛选
        </AppButton>
      </EmptyState>

      <template v-else>
        <AppTable table-class="task-table">
          <colgroup>
            <col style="width: 6%" />
            <col style="width: 17%" />
            <col style="width: 9%" />
            <col style="width: 8%" />
            <col style="width: 9%" />
            <col style="width: 8%" />
            <col style="width: 18%" />
            <col style="width: 15%" />
            <col style="width: 10%" />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>任务编号</th>
              <th>车辆</th>
              <th>类型</th>
              <th>状态</th>
              <th>优先级</th>
              <th>起点 → 终点</th>
              <th>开始时间</th>
              <th class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in rows" :key="task.taskId">
              <td class="num muted">#{{ task.taskId }}</td>
              <td class="code-cell">{{ task.taskCode || '—' }}</td>
              <td>{{ task.agvCode || '—' }}</td>
              <td>{{ taskTypeText(task.taskType) }}</td>
              <td><StatusPill :status="task.status" kind="task" /></td>
              <td><StatusPill :status="task.priority" kind="priority" :dot="false" /></td>
              <td class="route-cell">
                <span>{{ task.source || '—' }}</span>
                <Icon name="arrow-right" :size="12" class="route-arrow" />
                <span>{{ task.destination || '—' }}</span>
              </td>
              <td class="muted nowrap">{{ formatTime(task.startTime) }}</td>
              <td>
                <div class="cell-actions">
                  <AppTooltip :content="canCancel(task) ? '' : '已完成 / 已取消 / 失败的任务不可取消'">
                    <AppButton
                      size="sm"
                      variant="secondary"
                      :disabled="!canCancel(task) || actionKey !== null"
                      @click="onCancelTask(task)"
                    >
                      取消
                    </AppButton>
                  </AppTooltip>
                </div>
              </td>
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

  <AppModal
    v-model="createOpen"
    title="新建运输任务"
    subtitle="选择车辆与起终点，后端规划 当前位 → 起点 → 终点"
    :width="520"
    :loading="submitting"
    confirm-label="下发任务"
    @confirm="submitCreate"
  >
    <div v-if="optionError" class="error-note option-error">
      <Icon name="alert" :size="14" />
      {{ optionError }}
    </div>
    <div class="create-panel">
      <div v-if="optionsLoading" class="stack">
        <SkeletonBlock v-for="index in 4" :key="index" height="34px" />
      </div>
      <template v-else>
        <label class="field">
          <span class="field-label">执行车辆</span>
          <AppSelect
            v-model="form.agvCode"
            :options="agvOptions"
            placeholder="请选择车辆"
            aria-label="执行车辆"
          />
          <span v-if="selectedCar" class="field-hint">
            当前坐标 ({{ selectedCar.x }}, {{ selectedCar.y }}) ·
            {{ selectedCar.taskId === null ? '无进行中任务' : `任务 #${selectedCar.taskId}` }}
          </span>
        </label>
        <div class="form-row">
          <label class="field">
            <span class="field-label">起点站点</span>
            <AppSelect
              v-model="form.startId"
              :options="stationOptions"
              placeholder="请选择起点"
              aria-label="起点站点"
            />
          </label>
          <label class="field">
            <span class="field-label">终点站点</span>
            <AppSelect
              v-model="form.endId"
              :options="stationOptions"
              placeholder="请选择终点"
              aria-label="终点站点"
            />
          </label>
        </div>

        <div class="route-preview">
          <div class="route-node">
            <span class="route-dot current" />
            <small>当前位置</small>
            <strong class="num">
              {{ selectedCar ? `(${selectedCar.x}, ${selectedCar.y})` : '—' }}
            </strong>
          </div>
          <span class="route-line"><Icon name="arrow-right" :size="14" /></span>
          <div class="route-node">
            <span class="route-dot start" />
            <small>起点</small>
            <strong class="num">
              {{ startStation ? `${startStation.id} (${startStation.x}, ${startStation.y})` : '—' }}
            </strong>
          </div>
          <span class="route-line"><Icon name="arrow-right" :size="14" /></span>
          <div class="route-node">
            <span class="route-dot end" />
            <small>终点</small>
            <strong class="num">
              {{ endStation ? `${endStation.id} (${endStation.x}, ${endStation.y})` : '—' }}
            </strong>
          </div>
        </div>
        <p class="field-hint">
          提交后调用 POST /agv/path，任务编号自动生成为 T{时间戳}；路径点数量以规划结果为准。
        </p>
      </template>
    </div>
  </AppModal>
</template>

<style scoped>
.search-input {
  width: 280px;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.code-cell {
  font-weight: 500;
  font-size: 12.5px;
  white-space: nowrap;
  max-width: none;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 固定表格布局：1440 宽下所有列完整可见，不产生表格内部横向滚动 */
:deep(.task-table) {
  table-layout: fixed;
  width: 100%;
}

:deep(.task-table th),
:deep(.task-table td) {
  padding: 11px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.task-table .route-cell) {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
}

:deep(.task-table .route-cell > span) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.task-table .cell-actions) {
  justify-content: flex-end;
}

@media (max-width: 900px) {
  :deep(.task-table) {
    min-width: 680px;
  }
}

.nowrap {
  white-space: nowrap;
}

.route-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.route-arrow {
  color: var(--text-tertiary);
  flex: none;
}

.actions-col {
  text-align: right;
}

.data-table td .cell-actions {
  justify-content: flex-end;
}

.inline-warning {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--orange-text);
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.create-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.option-error {
  margin-bottom: 12px;
}

.route-preview {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
}

.route-node {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.route-node small {
  font-size: 10.5px;
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}

.route-node strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-bottom: 2px;
}

.route-dot.current {
  background: var(--gray);
}

.route-dot.start {
  background: var(--accent);
}

.route-dot.end {
  background: var(--green);
}

.route-line {
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
}

@media (max-width: 768px) {
  .search-input {
    width: 100%;
  }

  .route-preview {
    grid-template-columns: 1fr;
    justify-items: start;
    gap: 10px;
  }

  .route-line {
    transform: rotate(90deg);
  }
}
</style>
