<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgvMapCanvas from '../components/AgvMapCanvas.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppInput from '../components/ui/AppInput.vue'
import AppPagination from '../components/ui/AppPagination.vue'
import AppSegmented from '../components/ui/AppSegmented.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppTable from '../components/ui/AppTable.vue'
import AppTooltip from '../components/ui/AppTooltip.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { clearAllTasks, createPathTask, listAgv, previewPath } from '../api/agv'
import { getCurrentMap, getStations } from '../api/map'
import { cancelTask, pageTasks } from '../api/task'
import { confirmDialog } from '../composables/useConfirm'
import { usePolling } from '../composables/usePolling'
import { toast } from '../composables/useToast'
import type { AgvMap, AgvSnapshot, AgvTask, PathNode, Station } from '../types'
import { agvColor } from '../utils/colors'
import { pickDefaultAgv, pickNearestIdleAgv } from '../utils/agvRules'
import { agvStatusMeta, formatTime, taskTypeText } from '../utils/labels'

interface MapCanvasApi {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
}

const route = useRoute()
const router = useRouter()

const mode = ref<'list' | 'wizard'>('list')

/* ------------------------------ 列表 ------------------------------ */

const rows = ref<AgvTask[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(true)
const errorText = ref('')
const taskCodeInput = ref('')
const taskCodeFilter = ref('')
const statusFilter = ref('all')
const agvFilter = ref('')
const actionKey = ref<string | null>(null)

const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'processing', label: '执行中' },
  { value: 'waiting', label: '等待' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
]

const pageSizeOptions = [
  { value: '10', label: '每页 10 条' },
  { value: '20', label: '每页 20 条' },
  { value: '50', label: '每页 50 条' },
]

const agvFilterOptions = computed(() => [
  { value: '', label: '全部车辆' },
  ...agvs.value.map((car) => ({ value: car.agvCode, label: car.agvCode })),
])

async function load(): Promise<void> {
  try {
    const result = await pageTasks(
      {
        page: page.value,
        pageSize: pageSize.value,
        taskCode: taskCodeFilter.value || undefined,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        agvCode: agvFilter.value || undefined,
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
const { running, refresh } = poller

function applyFilters(): void {
  page.value = 1
  void load().catch(() => {})
}

function resetFilters(): void {
  taskCodeInput.value = ''
  taskCodeFilter.value = ''
  statusFilter.value = 'all'
  agvFilter.value = ''
  page.value = 1
  void load().catch(() => {})
}

function onPagerChange(payload: { page: number; pageSize: number }): void {
  page.value = payload.page
  pageSize.value = payload.pageSize
  void load().catch(() => {})
}

function onPageSizeChange(value: string): void {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return
  pageSize.value = size
  page.value = 1
  void load().catch(() => {})
}

function applySearch(): void {
  taskCodeFilter.value = taskCodeInput.value.trim()
  applyFilters()
}

function clearSearch(): void {
  taskCodeInput.value = ''
  taskCodeFilter.value = ''
  applyFilters()
}

async function cancelRow(row: AgvTask): Promise<void> {
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

async function clearAll(): Promise<void> {
  const confirmed = await confirmDialog({
    title: '清空全部任务',
    message: '将取消所有车辆当前任务，并把车辆状态重置为空闲。此操作不可撤销。',
    detail: '对应接口：POST /agv/clear',
    confirmLabel: '清空任务',
    danger: true,
  })
  if (!confirmed || actionKey.value) return
  actionKey.value = 'clear'
  try {
    await clearAllTasks()
    toast.success('已清空全部任务')
    await load().catch(() => {})
    await loadWizardOptions().catch(() => {})
  } catch {
    /* http 层已提示 */
  } finally {
    actionKey.value = null
  }
}

const canCancel = (row: AgvTask): boolean =>
  row.status !== 'completed' && row.status !== 'cancelled' && row.status !== 'failed'

/* ------------------------------ 向导 ------------------------------ */

const agvs = ref<AgvSnapshot[]>([])
const stations = ref<Station[]>([])
const optionsLoading = ref(false)
const optionError = ref('')
const wizardAgvCode = ref('')
const startId = ref('')
const endId = ref('')
const previewNodes = ref<PathNode[]>([])
const previewError = ref('')
const previewLoading = ref(false)
const submitting = ref(false)
const successNodes = ref<PathNode[]>([])
const successTaskCode = ref('')
const zoomPercent = ref(100)
const wizardMapRef = ref<MapCanvasApi | null>(null)

const mapData = ref<AgvMap | null>(null)

const wizardAgvs = computed(() =>
  [...agvs.value].sort((a, b) => {
    const aIdle = a.taskId === null ? 0 : 1
    const bIdle = b.taskId === null ? 0 : 1
    return aIdle - bIdle || a.agvCode.localeCompare(b.agvCode)
  }),
)

const wizardAgv = computed(
  () => agvs.value.find((car) => car.agvCode === wizardAgvCode.value) ?? null,
)
const startStation = computed(
  () => stations.value.find((station) => station.id === startId.value) ?? null,
)
const endStation = computed(
  () => stations.value.find((station) => station.id === endId.value) ?? null,
)

const step = computed(() => {
  if (!wizardAgv.value) return 1
  if (!startId.value) return 2
  if (!endId.value) return 3
  if (successNodes.value.length) return 5
  return 4
})

const highlightPath = computed<PathNode[] | null>(() => {
  if (successNodes.value.length) return successNodes.value
  if (previewNodes.value.length) return previewNodes.value
  return null
})

const pathDistance = computed(() => {
  const nodes = successNodes.value.length ? successNodes.value : previewNodes.value
  if (!nodes.length) return null
  const cell = mapData.value?.cellSize ?? 20
  const cm = (nodes.length - 1) * cell
  const speed = Math.max(50, wizardAgv.value?.speed || 150)
  return {
    points: nodes.length,
    meters: (cm / 100).toFixed(1),
    seconds: Math.max(1, Math.round(cm / speed)),
  }
})

async function loadWizardOptions(): Promise<void> {
  optionsLoading.value = true
  optionError.value = ''
  try {
    const [cars, sites] = await Promise.all([listAgv(true), getStations(true)])
    agvs.value = cars
    stations.value = sites
    if (!wizardAgvCode.value || !cars.some((car) => car.agvCode === wizardAgvCode.value)) {
      wizardAgvCode.value = pickDefaultAgv(cars)?.agvCode ?? ''
    }
  } catch (error) {
    optionError.value = error instanceof Error ? error.message : '车辆或站点加载失败'
  } finally {
    optionsLoading.value = false
  }
}

async function loadWizardMap(): Promise<void> {
  try {
    mapData.value = await getCurrentMap(true)
  } catch {
    /* 地图加载失败时向导仍可用站点列表 */
  }
}

async function preview(): Promise<void> {
  const car = wizardAgv.value
  const start = startStation.value
  const end = endStation.value
  if (!car || !start || !end) return
  previewLoading.value = true
  previewError.value = ''
  try {
    previewNodes.value = await previewPath({
      agvCode: car.agvCode,
      taskCode: `T${Date.now()}`,
      startPoint: { id: start.id, x: start.x, y: start.y },
      endPoint: { id: end.id, x: end.x, y: end.y },
      currentPoint: { x: car.x, y: car.y },
    })
  } catch (error) {
    previewNodes.value = []
    previewError.value =
      error instanceof Error
        ? `${error.message}（预览接口不可用时可忽略，直接下发会返回真实规划路径）`
        : '路径预览失败，可直接下发'
  } finally {
    previewLoading.value = false
  }
}

let previewTimer = 0
watch([wizardAgvCode, startId, endId], () => {
  successNodes.value = []
  successTaskCode.value = ''
  if (previewTimer) window.clearTimeout(previewTimer)
  if (wizardAgv.value && startStation.value && endStation.value && startId.value !== endId.value) {
    previewTimer = window.setTimeout(() => void preview(), 120)
  } else {
    previewNodes.value = []
    previewError.value = ''
  }
})

function onWizardAgvClick(payload: { code: string }): void {
  wizardAgvCode.value = payload.code
}

function onWizardStationClick(payload: { station: Station }): void {
  if (!startId.value) {
    startId.value = payload.station.id
    return
  }
  if (!endId.value) {
    if (payload.station.id === startId.value) {
      toast.warning('起点与终点不能相同，请点击其他站点')
      return
    }
    endId.value = payload.station.id
    return
  }
  endId.value = payload.station.id
}

function resetStart(): void {
  startId.value = ''
  endId.value = ''
  successNodes.value = []
}

function resetEnd(): void {
  endId.value = ''
  successNodes.value = []
}

function resetWizard(): void {
  startId.value = ''
  endId.value = ''
  previewNodes.value = []
  previewError.value = ''
  successNodes.value = []
  successTaskCode.value = ''
}

async function confirmTask(): Promise<void> {
  const car = wizardAgv.value
  const start = startStation.value
  const end = endStation.value
  if (!car || !start || !end) {
    toast.warning('请先选择车辆与起终点')
    return
  }
  if (start.id === end.id) {
    toast.warning('起点与终点不能相同')
    return
  }
  submitting.value = true
  try {
    const taskCode = `T${Date.now()}`
    const nodes = await createPathTask({
      agvCode: car.agvCode,
      taskCode,
      startPoint: { id: start.id, x: start.x, y: start.y },
      endPoint: { id: end.id, x: end.x, y: end.y },
      currentPoint: { x: car.x, y: car.y },
    })
    toast.success('任务已下发', `规划 ${nodes.length} 个路径点（${car.agvCode}）`)
    successNodes.value = nodes
    successTaskCode.value = taskCode
    page.value = 1
    await load().catch(() => {})
    await loadWizardOptions().catch(() => {})
  } catch {
    /* http 层已提示后端 msg */
  } finally {
    submitting.value = false
  }
}

async function openWizard(prefill?: { start?: string; end?: string }): Promise<void> {
  mode.value = 'wizard'
  resetWizard()
  optionsLoading.value = true
  await Promise.all([loadWizardOptions(), loadWizardMap()])
  if (prefill?.start) {
    startId.value = prefill.start
    const station = stations.value.find((item) => item.id === prefill.start)
    if (station) {
      wizardAgvCode.value = pickNearestIdleAgv(agvs.value, station)?.agvCode ?? wizardAgvCode.value
    }
  }
  if (prefill?.end) endId.value = prefill.end
  optionsLoading.value = false
}

function backToList(): void {
  mode.value = 'list'
  void load().catch(() => {})
}

function consumeQuery(): void {
  if (route.query.wizard !== '1') return
  const start = typeof route.query.start === 'string' ? route.query.start : undefined
  const end = typeof route.query.end === 'string' ? route.query.end : undefined
  void openWizard({ start, end })
  void router.replace({ path: '/task' })
}

onMounted(() => {
  void load().catch(() => {})
  void loadWizardOptions().catch(() => {})
  consumeQuery()
})

watch(
  () => route.query.wizard,
  () => consumeQuery(),
)
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <template v-if="mode === 'list'">
      <AppButton size="sm" variant="secondary" :loading="false" @click="refresh">
        <Icon name="refresh" :size="14" />
        刷新
      </AppButton>
      <AppButton size="sm" variant="danger" :loading="actionKey === 'clear'" @click="clearAll">
        <Icon name="trash" :size="14" />
        清空全部任务
      </AppButton>
      <AppButton size="sm" variant="primary" @click="openWizard()">
        <Icon name="plus" :size="14" />
        新建任务
      </AppButton>
    </template>
    <template v-else>
      <AppButton size="sm" variant="secondary" @click="resetWizard">
        <Icon name="refresh" :size="14" />
        重置
      </AppButton>
      <AppButton size="sm" variant="primary" @click="backToList">
        <Icon name="chevron-left" :size="14" />
        返回列表
      </AppButton>
    </template>
  </Teleport>

  <!-- 列表视图 -->
  <div v-if="mode === 'list'" class="page">
    <div class="toolbar">
      <AppInput
        v-model="taskCodeInput"
        placeholder="搜索任务编号"
        icon="search"
        size="sm"
        clearable
        class="search-input"
        @enter="applySearch"
        @clear="clearSearch"
      />
      <AppSegmented v-model="statusFilter" :options="STATUS_OPTIONS" size="sm" @update:model-value="applyFilters" />
      <AppSelect
        v-model="agvFilter"
        :options="agvFilterOptions"
        size="sm"
        aria-label="车辆筛选"
        @update:model-value="applyFilters"
      />
      <AppSelect
        :model-value="String(pageSize)"
        :options="pageSizeOptions"
        size="sm"
        aria-label="每页条数"
        @update:model-value="onPageSizeChange"
      />
      <AppButton v-if="taskCodeFilter || statusFilter !== 'all' || agvFilter" size="sm" variant="secondary" @click="resetFilters">
        <Icon name="close" :size="13" />
        清除筛选
      </AppButton>
      <span class="toolbar-spacer" />
      <AppSwitch v-model="running" size="sm" label="自动刷新（3s）" />
    </div>

    <div class="toolbar quick-create">
      <div class="quick-create-text">
        <Icon name="map" :size="16" />
        <span>地图选点创建任务：选车 → 点起点 → 点终点 → 确认，全程 3~4 次点击</span>
      </div>
      <AppButton size="sm" variant="primary" @click="openWizard()">
        <Icon name="plus" :size="14" />
        地图选点新建任务
      </AppButton>
    </div>

    <div v-if="loading && !rows.length" class="table-skeleton">
      <SkeletonBlock v-for="index in 7" :key="index" height="46px" radius="10px" />
    </div>

    <div v-else-if="errorText && !rows.length" class="notice-card">
      <EmptyState title="无法加载任务列表" :description="`${errorText}。请确认后端服务已启动后重试。`">
        <AppButton variant="primary" @click="refresh">
          <Icon name="refresh" :size="14" />
          重试
        </AppButton>
      </EmptyState>
    </div>

    <div v-else class="card">
      <div class="card-head">
        <div>
          <h2>任务列表</h2>
          <p>共 {{ total }} 条任务 · 服务端分页与筛选</p>
        </div>
      </div>
      <EmptyState
        v-if="!rows.length"
        title="没有匹配的任务"
        description="试试更换筛选条件，或用地图选点直接创建任务。"
      >
        <AppButton size="sm" variant="secondary" @click="resetFilters">清除筛选</AppButton>
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
                      @click="cancelRow(task)"
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
    </div>
  </div>

  <!-- 地图选点向导 -->
  <div v-else class="wizard-page">
    <div class="wizard-map">
      <AgvMapCanvas
        ref="wizardMapRef"
        :map="mapData"
        :agvs="agvs"
        :selected-code="wizardAgvCode"
        :start-station-id="startId || null"
        :end-station-id="endId || null"
        :highlight-path="highlightPath"
        :show-paths="false"
        empty-text="暂未获取到当前地图"
        @agv-click="onWizardAgvClick"
        @station-click="onWizardStationClick"
        @viewport-change="zoomPercent = $event.percent"
      />
      <div class="float wizard-hint glass">
        <Icon name="info" :size="13" />
        {{ !startId ? '点击地图上的站点作为起点' : !endId ? '点击地图上的站点作为终点' : successNodes.length ? '任务已下发，路径已高亮' : '已选起终点，可确认下发' }}
      </div>
      <div class="float wizard-zoom glass">
        <button type="button" class="zoom-btn" aria-label="缩小" @click="wizardMapRef?.zoomOut()">
          <Icon name="minus" :size="15" />
        </button>
        <span class="num">{{ zoomPercent }}%</span>
        <button type="button" class="zoom-btn" aria-label="放大" @click="wizardMapRef?.zoomIn()">
          <Icon name="plus" :size="15" />
        </button>
        <button type="button" class="zoom-btn" aria-label="适应窗口" @click="wizardMapRef?.fit()">
          <Icon name="expand" :size="15" />
        </button>
      </div>
    </div>

    <aside class="wizard-side">
      <div class="wizard-card">
        <header class="wizard-head">
          <h2>新建任务</h2>
          <p>选车 → 点起点 → 点终点 → 确认下发</p>
        </header>

        <div class="steps">
          <span class="step" :class="{ active: step === 1, done: step > 1 }"><i>1</i>选车</span>
          <span class="step" :class="{ active: step === 2, done: step > 2 }"><i>2</i>起点</span>
          <span class="step" :class="{ active: step === 3, done: step > 3 }"><i>3</i>终点</span>
          <span class="step" :class="{ active: step === 4 || step === 5, done: step === 5 }"><i>4</i>下发</span>
        </div>

        <div v-if="optionError" class="error-note option-error">
          <Icon name="alert" :size="14" />
          {{ optionError }}
        </div>

        <div v-if="optionsLoading" class="stack">
          <SkeletonBlock v-for="index in 4" :key="index" height="34px" />
        </div>

        <template v-else>
          <section class="wizard-section">
            <div class="section-title">
              <span>① 选择车辆</span>
              <span class="section-note">默认空闲车</span>
            </div>
            <div class="vehicle-picker">
              <button
                v-for="car in wizardAgvs"
                :key="car.agvCode"
                type="button"
                class="vehicle-chip"
                :class="{ active: car.agvCode === wizardAgvCode }"
                @click="wizardAgvCode = car.agvCode"
              >
                <i :style="{ background: agvColor(car.agvCode) }" />
                <span class="chip-code">{{ car.agvCode }}</span>
                <span class="chip-status">{{ agvStatusMeta(car.status).text }}</span>
              </button>
            </div>
          </section>

          <section class="wizard-section">
            <div class="section-title"><span>② 起终点</span></div>
            <div class="point-row">
              <div class="point-chip" :class="{ filled: startStation }">
                <i class="point-dot start" />
                <span>{{ startStation ? `${startStation.id} (${startStation.x}, ${startStation.y})` : '点击地图站点设为起点' }}</span>
                <button v-if="startStation" type="button" class="mini-btn" @click="resetStart">重选</button>
              </div>
              <div class="point-chip" :class="{ filled: endStation }">
                <i class="point-dot end" />
                <span>{{ endStation ? `${endStation.id} (${endStation.x}, ${endStation.y})` : '点击地图站点设为终点' }}</span>
                <button v-if="endStation" type="button" class="mini-btn" @click="resetEnd">重选</button>
              </div>
            </div>
          </section>

          <section class="wizard-section preview-box">
            <div class="section-title"><span>③ 路径预览</span></div>
            <div v-if="previewLoading" class="preview-loading">
              <SkeletonBlock height="16px" />
              <SkeletonBlock height="16px" width="70%" />
            </div>
            <template v-else-if="pathDistance">
              <div class="preview-stats">
                <div><span class="stat-value num">{{ pathDistance.points }}</span><span class="stat-label">路径点</span></div>
                <div><span class="stat-value num">{{ pathDistance.meters }}</span><span class="stat-label">米</span></div>
                <div><span class="stat-value num">~{{ pathDistance.seconds }}</span><span class="stat-label">秒</span></div>
              </div>
              <p class="preview-source">来源：POST /agv/{{ successNodes.length ? 'path（已下发）' : 'preview（仅预览）' }}</p>
            </template>
            <p v-else-if="previewError" class="preview-error">
              <Icon name="alert" :size="13" />
              {{ previewError }}
            </p>
            <p v-else class="preview-empty">选择起终点后自动调用 POST /agv/preview 预览路径</p>
          </section>

          <div v-if="successNodes.length" class="success-box">
            <div class="success-title">
              <Icon name="check-circle" :size="18" />
              已下发，规划 {{ successNodes.length }} 个路径点
            </div>
            <p>任务编号：{{ successTaskCode }} · 地图已高亮路径</p>
            <div class="success-actions">
              <AppButton size="sm" variant="secondary" @click="backToList">查看任务列表</AppButton>
              <AppButton size="sm" variant="primary" @click="resetWizard">再建一个</AppButton>
            </div>
          </div>

          <div v-else class="wizard-actions">
            <AppButton size="md" variant="secondary" block @click="resetWizard">重置</AppButton>
            <AppButton
              size="md"
              variant="primary"
              block
              :loading="submitting"
              :disabled="!wizardAgv || !startStation || !endStation || startId === endId"
              @click="confirmTask"
            >
              <Icon name="check" :size="16" />
              确认下发任务
            </AppButton>
          </div>
        </template>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.search-input {
  width: 210px;
}

.quick-create {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--accent-tint);
}

.quick-create-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--accent);
  flex: 1;
  min-width: 0;
}

/* 列表卡片 */
.card {
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 16px 18px 18px;
  min-width: 0;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}

.card-head h2 {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.card-head p {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
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

.nowrap {
  white-space: nowrap;
}

.route-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
}

.route-arrow {
  color: var(--text-tertiary);
  flex: none;
}

.actions-col {
  text-align: right;
}

/* 向导 */
.wizard-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  height: calc(100vh - var(--topbar-h) - 96px);
  min-height: 520px;
}

.wizard-map {
  position: relative;
  min-width: 0;
  height: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.wizard-map :deep(.map-canvas) {
  border-radius: var(--radius-lg);
}

.float {
  position: absolute;
  z-index: 5;
  border-radius: var(--radius-md);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card);
}

.glass {
  background: var(--surface-glass);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}

.wizard-hint {
  left: 14px;
  top: 14px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  max-width: calc(100% - 180px);
}

.wizard-zoom {
  right: 14px;
  top: 14px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
}

.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--text-secondary);
}

.zoom-btn:hover {
  background: var(--surface-subtle);
  color: var(--accent);
}

.wizard-zoom span {
  min-width: 44px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
}

.wizard-side {
  min-width: 0;
  height: 100%;
  overflow-y: auto;
}

.wizard-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.wizard-head h2 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.wizard-head p {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 9px;
  background: var(--surface-subtle);
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.step i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--separator);
  color: var(--text-secondary);
  font-style: normal;
  font-size: 10.5px;
  font-weight: 700;
}

.step.active {
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: 600;
}

.step.active i {
  background: var(--accent);
  color: #fff;
}

.step.done i {
  background: var(--green);
  color: #fff;
}

.wizard-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.section-note {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-tertiary);
}

.vehicle-picker {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  max-height: 156px;
  overflow-y: auto;
}

.vehicle-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface-subtle);
  border: 1.5px solid transparent;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: left;
  transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
}

.vehicle-chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.vehicle-chip .chip-code {
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vehicle-chip .chip-status {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.vehicle-chip.active {
  border-color: var(--accent);
  background: var(--accent-tint);
}

.point-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.point-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--surface-subtle);
  font-size: 12px;
  color: var(--text-tertiary);
}

.point-chip.filled {
  color: var(--text);
  background: var(--surface-subtle);
}

.point-chip span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.point-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.point-dot.start {
  background: var(--accent);
}

.point-dot.end {
  background: var(--green);
}

.mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-tint);
}

.preview-box {
  padding: 11px;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
}

.preview-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.preview-stats > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 8px 4px;
  border-radius: 9px;
  background: var(--surface);
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
}

.stat-label {
  font-size: 10.5px;
  color: var(--text-tertiary);
}

.preview-source,
.preview-empty {
  margin-top: 8px;
  font-size: 10.5px;
  color: var(--text-tertiary);
}

.preview-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  color: var(--orange-text);
  line-height: 1.5;
}

.success-box {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 13px;
  border-radius: var(--radius-md);
  background: var(--green-tint);
  color: var(--green-text);
}

.success-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}

.success-box p {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.success-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.wizard-actions {
  display: flex;
  gap: 8px;
}

.option-error {
  margin-bottom: 4px;
}

@media (max-width: 1100px) {
  .wizard-page {
    grid-template-columns: minmax(0, 1fr) 320px;
  }

  .vehicle-picker {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .wizard-page {
    grid-template-columns: 1fr;
    height: auto;
  }

  .wizard-map {
    height: 60vh;
    min-height: 380px;
  }

  .wizard-side {
    overflow: visible;
  }
}
</style>
