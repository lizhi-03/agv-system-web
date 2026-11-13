<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppDrawer from '../components/ui/AppDrawer.vue'
import AppInput from '../components/ui/AppInput.vue'
import AppModal from '../components/ui/AppModal.vue'
import AppNumberField from '../components/ui/AppNumberField.vue'
import AppSegmented from '../components/ui/AppSegmented.vue'
import AppSlider from '../components/ui/AppSlider.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppTable from '../components/ui/AppTable.vue'
import AppTooltip from '../components/ui/AppTooltip.vue'
import BatteryBar from '../components/ui/BatteryBar.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import {
  batchAgv,
  chargeAgv,
  getAgv,
  listAgv,
  reportAgv,
  setSpeed,
  startAgv,
  stopAgv,
} from '../api/agv'
import { confirmDialog } from '../composables/useConfirm'
import { usePolling } from '../composables/usePolling'
import { toast } from '../composables/useToast'
import type { AgvSnapshot } from '../types'
import { agvColor } from '../utils/colors'
import { formatTime } from '../utils/labels'

const agvs = ref<AgvSnapshot[]>([])
const loading = ref(true)
const errorText = ref('')
const search = ref('')
const statusFilter = ref('all')
const batchCount = ref(1)
const batchBusy = ref(false)
const actionKey = ref<string | null>(null)

const speedOpen = ref(false)
const speedValue = ref(150)
const current = ref<AgvSnapshot | null>(null)

const reportOpen = ref(false)
const reportX = ref(0)
const reportY = ref(0)

const detailOpen = ref(false)
const detail = ref<AgvSnapshot | null>(null)
const detailLoading = ref(false)

const SPEED_PRESETS = [50, 100, 150, 200, 300]

async function load(): Promise<void> {
  try {
    agvs.value = await listAgv(true)
    errorText.value = ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '车辆列表加载失败'
    throw error
  } finally {
    loading.value = false
  }
}

const poller = usePolling(load, { interval: 2000 })
const { running, refresh, inFlight } = poller

const filtered = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return agvs.value
    .filter((car) => statusFilter.value === 'all' || car.status === statusFilter.value)
    .filter((car) => !keyword || car.agvCode.toLowerCase().includes(keyword))
    .sort((a, b) => a.agvCode.localeCompare(b.agvCode))
})

const statusOptions = computed(() => {
  const count = (status: string): number =>
    agvs.value.filter((car) => car.status === status).length
  return [
    { value: 'all', label: `全部 ${agvs.value.length}` },
    { value: 'idle', label: `空闲 ${count('idle')}` },
    { value: 'running', label: `运行 ${count('running')}` },
    { value: 'charging', label: `充电 ${count('charging')}` },
    { value: 'error', label: `异常 ${count('error')}` },
    { value: 'stopping', label: `停止 ${count('stopping')}` },
  ]
})

const busy = computed(() => actionKey.value !== null)

async function runAction(
  key: string,
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  if (actionKey.value) return
  actionKey.value = key
  try {
    await action()
    toast.success(message)
    await load().catch(() => {})
  } catch {
    /* http 层已给出错误提示 */
  } finally {
    actionKey.value = null
  }
}

async function addCars(): Promise<void> {
  // 防抖：确认弹窗 + 请求期间禁止重复触发，避免重复叠加模拟器定时任务
  if (batchBusy.value || actionKey.value) return
  batchBusy.value = true
  try {
    const count = batchCount.value
    const lastCode = `AGVplus${String(count).padStart(4, '0')}`
    const confirmed = await confirmDialog({
      title: '批量加车',
      message: `将新增 ${count} 辆车，编号固定为 AGVplus0001 ~ ${lastCode}。`,
      detail:
        '后端每次调用都从 AGVplus0001 开始生成固定编号；若之前添加过相同编号，列表会出现重复编号车辆。batch 车辆由内存模拟器维持 idle@(0,0)，暂不支持稳定执行任务。',
      confirmLabel: '确认添加',
    })
    if (!confirmed) return
    actionKey.value = 'batch'
    try {
      await batchAgv(count)
      toast.success(`已添加 ${count} 辆车`, `AGVplus0001 ~ ${lastCode}（由模拟器维持 idle，建议暂不派发任务）`)
      await load().catch(() => {})
    } catch {
      /* http 层已提示 */
    } finally {
      actionKey.value = null
    }
  } finally {
    batchBusy.value = false
  }
}

function startBlockReason(car: AgvSnapshot): string {
  if (car.taskId === null) return '该车辆当前没有任务，无法启动'
  if (car.status === 'running') return '车辆正在运行中，无需启动'
  if (car.status !== 'stopping') return '仅已暂停（stopping）车辆可启动'
  return ''
}

function stopBlockReason(car: AgvSnapshot): string {
  if (car.taskId === null) return '该车辆当前没有任务，无法暂停'
  if (car.status !== 'running') return '仅运行中车辆可暂停'
  return ''
}

function canStart(car: AgvSnapshot): boolean {
  return startBlockReason(car) === ''
}

function canStop(car: AgvSnapshot): boolean {
  return stopBlockReason(car) === ''
}

function onStart(car: AgvSnapshot): void {
  const reason = startBlockReason(car)
  if (reason) {
    toast.warning(reason)
    return
  }
  void runAction(`start:${car.agvCode}`, () => startAgv({ agvCode: car.agvCode }), `${car.agvCode} 已恢复运行`)
}

function onStop(car: AgvSnapshot): void {
  const reason = stopBlockReason(car)
  if (reason) {
    toast.warning(reason)
    return
  }
  void runAction(`stop:${car.agvCode}`, () => stopAgv({ agvCode: car.agvCode }), `${car.agvCode} 已暂停`)
}

function onCharge(car: AgvSnapshot): void {
  void runAction(
    `charge:${car.agvCode}`,
    () => chargeAgv(car.agvCode),
    `已向 ${car.agvCode} 下发充电指令`,
  )
}

function openSpeed(car: AgvSnapshot): void {
  current.value = car
  speedValue.value = Math.round(car.speed)
  speedOpen.value = true
}

async function saveSpeed(): Promise<void> {
  const car = current.value
  if (!car) return
  if (actionKey.value) return
  actionKey.value = 'speed'
  try {
    await setSpeed({ agvCode: car.agvCode, speed: speedValue.value })
    toast.success('速度已更新', `${car.agvCode} 目标速度 ${speedValue.value} cm/s`)
    speedOpen.value = false
    await load().catch(() => {})
  } catch {
    /* http 层已提示 */
  } finally {
    actionKey.value = null
  }
}

function openReport(car: AgvSnapshot): void {
  current.value = car
  reportX.value = car.x
  reportY.value = car.y
  reportOpen.value = true
}

async function saveReport(): Promise<void> {
  const car = current.value
  if (!car) return
  if (actionKey.value) return
  actionKey.value = 'report'
  try {
    // 后端为合并语义：只提交坐标即可，taskId / plannedPath 等任务字段自动保留
    await reportAgv({
      agvCode: car.agvCode,
      x: Math.round(reportX.value),
      y: Math.round(reportY.value),
    })
    toast.success('位置已上报', `(${Math.round(reportX.value)}, ${Math.round(reportY.value)})`)
    reportOpen.value = false
    await load().catch(() => {})
  } catch {
    /* http 层已提示 */
  } finally {
    actionKey.value = null
  }
}

async function openDetail(car: AgvSnapshot): Promise<void> {
  detailOpen.value = true
  detail.value = null
  detailLoading.value = true
  try {
    detail.value = await getAgv(car.agvCode, true)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '加载车辆详情失败')
  } finally {
    detailLoading.value = false
  }
}
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="primary" :loading="inFlight" @click="refresh">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
  </Teleport>

  <div class="page">
    <div class="toolbar">
      <AppInput
        v-model="search"
        placeholder="搜索车辆编号"
        icon="search"
        size="sm"
        clearable
        class="search-input"
      />
      <AppSegmented v-model="statusFilter" :options="statusOptions" size="sm" />
      <span class="toolbar-spacer" />
      <div class="batch-add">
        <span class="batch-label">加车数量</span>
        <AppNumberField v-model="batchCount" :min="1" :max="20" size="sm" aria-label="加车数量" />
        <AppButton
          size="sm"
          variant="primary"
          :loading="batchBusy || actionKey === 'batch'"
          :disabled="busy || batchBusy"
          @click="addCars"
        >
          <Icon name="plus" :size="14" />
          批量加车
        </AppButton>
      </div>
      <AppSwitch v-model="running" size="sm" label="自动刷新（2s）" />
    </div>

    <AppCard
      title="车辆列表"
      :subtitle="`共 ${agvs.length} 辆，筛选后 ${filtered.length} 辆`"
      padding="sm"
    >
      <template #actions>
        <span v-if="errorText && agvs.length" class="inline-warning">
          <Icon name="alert" :size="13" />
          {{ errorText }}
        </span>
      </template>

      <div v-if="loading && !agvs.length" class="table-skeleton">
        <SkeletonBlock v-for="index in 6" :key="index" height="48px" radius="10px" />
      </div>

      <AppCard v-else-if="errorText && !agvs.length" padding="none">
        <EmptyState
          title="无法加载车辆列表"
          :description="`${errorText}。请确认后端服务已启动后重试。`"
        >
          <AppButton variant="primary" @click="refresh">
            <Icon name="refresh" :size="14" />
            重试
          </AppButton>
        </EmptyState>
      </AppCard>

      <EmptyState
        v-else-if="!filtered.length"
        :title="agvs.length ? '没有匹配的车辆' : '暂无车辆'"
        :description="
          agvs.length
            ? '试试更换状态筛选或清空搜索关键字。'
            : '点击右上角“批量加车”，后端会生成 AGVplus0001 起的车辆。'
        "
      >
        <AppButton
          v-if="agvs.length"
          size="sm"
          variant="secondary"
          @click="((search = ''), (statusFilter = 'all'))"
        >
          清空筛选
        </AppButton>
      </EmptyState>

      <AppTable v-else>
        <thead>
          <tr>
            <th>编号</th>
            <th>状态</th>
            <th>电量</th>
            <th>速度</th>
            <th>位置</th>
            <th>当前任务</th>
            <th>最后更新</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="car in filtered"
            :key="car.agvCode"
            class="is-clickable"
            @click="openDetail(car)"
          >
            <td>
              <span class="code-cell">
                <i class="dot" :style="{ background: agvColor(car.agvCode) }" />
                {{ car.agvCode }}
              </span>
            </td>
            <td><StatusPill :status="car.status" kind="agv" /></td>
            <td><BatteryBar :value="car.battery" width="56px" /></td>
            <td class="num nowrap">{{ Math.round(car.speed) }} <small>cm/s</small></td>
            <td class="num nowrap">({{ car.x }}, {{ car.y }})</td>
            <td class="num nowrap">{{ car.taskId === null ? '—' : `#${car.taskId}` }}</td>
            <td class="muted nowrap">{{ formatTime(car.lastUpdate) }}</td>
            <td>
              <div class="cell-actions" @click.stop>
                <AppTooltip :content="startBlockReason(car)">
                  <AppButton
                    size="sm"
                    variant="tint"
                    :disabled="busy || !canStart(car)"
                    @click="onStart(car)"
                  >
                    启动
                  </AppButton>
                </AppTooltip>
                <AppTooltip :content="stopBlockReason(car)">
                  <AppButton
                    size="sm"
                    variant="secondary"
                    :disabled="busy || !canStop(car)"
                    @click="onStop(car)"
                  >
                    暂停
                  </AppButton>
                </AppTooltip>
                <AppButton size="sm" variant="secondary" :disabled="busy" @click="openSpeed(car)">
                  调速
                </AppButton>
                <AppTooltip content="前往最近充电站（地图需有 charge 站点）">
                  <AppButton size="sm" variant="secondary" :disabled="busy" @click="onCharge(car)">
                    充电
                  </AppButton>
                </AppTooltip>
                <AppTooltip content="仅提交坐标（后端合并语义，任务字段自动保留）">
                  <AppButton
                    size="sm"
                    variant="secondary"
                    :disabled="busy"
                    @click="openReport(car)"
                  >
                    上报
                  </AppButton>
                </AppTooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </AppTable>
    </AppCard>
  </div>

  <AppModal
    v-model="speedOpen"
    title="调节速度"
    :subtitle="current ? `${current.agvCode} · 当前 ${Math.round(current.speed)} cm/s` : ''"
    :width="420"
    :loading="actionKey === 'speed'"
    confirm-label="保存速度"
    @confirm="saveSpeed"
  >
    <div class="speed-panel">
      <div class="speed-value">
        <span class="num">{{ speedValue }}</span>
        <small>cm/s</small>
      </div>
      <AppSlider v-model="speedValue" :min="0" :max="1000" :step="10" aria-label="速度" />
      <div class="preset-row">
        <AppButton
          v-for="preset in SPEED_PRESETS"
          :key="preset"
          size="sm"
          :variant="speedValue === preset ? 'primary' : 'secondary'"
          @click="speedValue = preset"
        >
          {{ preset }}
        </AppButton>
      </div>
      <p class="field-hint">速度范围 0 ~ 1000 cm/s，保存后会立即下发到后端。</p>
      <p v-if="current && current.taskId === null" class="field-hint warning-hint">
        空闲车辆的速度会被后端模拟器在 1s 内重置为 0，建议在运行中车辆上调速。
      </p>
    </div>
  </AppModal>

  <AppModal
    v-model="reportOpen"
    title="上报位置"
    :subtitle="current ? `${current.agvCode} · 当前 (${current.x}, ${current.y})` : ''"
    :width="420"
    :loading="actionKey === 'report'"
    confirm-label="提交上报"
    @confirm="saveReport"
  >
    <div class="report-panel">
      <div class="form-row">
        <label class="field">
          <span class="field-label">X 坐标</span>
          <AppNumberField v-model="reportX" :min="0" :max="9999" aria-label="X 坐标" />
        </label>
        <label class="field">
          <span class="field-label">Y 坐标</span>
          <AppNumberField v-model="reportY" :min="0" :max="9999" aria-label="Y 坐标" />
        </label>
      </div>
      <p class="field-hint">
        后端为合并语义：仅提交坐标，车辆的 taskId / plannedPath / pathIndex / description /
        isCharge 等任务字段会自动保留，运行中车辆上报不会清空任务。
      </p>
    </div>
  </AppModal>

  <AppDrawer
    v-model="detailOpen"
    :title="detail?.agvCode || current?.agvCode || '车辆详情'"
    subtitle="GET /agv/{agvCode} 实时快照"
  >
    <div v-if="detailLoading" class="stack">
      <SkeletonBlock v-for="index in 7" :key="index" height="20px" />
    </div>
    <template v-else-if="detail">
      <div class="selected-head">
        <i class="big-dot" :style="{ background: agvColor(detail.agvCode) }" />
        <strong>{{ detail.agvCode }}</strong>
        <StatusPill :status="detail.status" kind="agv" />
      </div>
      <dl class="detail-grid">
        <div>
          <dt>电量</dt>
          <dd><BatteryBar :value="detail.battery" width="90px" /></dd>
        </div>
        <div>
          <dt>速度</dt>
          <dd class="num">{{ Math.round(detail.speed) }} cm/s</dd>
        </div>
        <div>
          <dt>坐标</dt>
          <dd class="num">({{ detail.x }}, {{ detail.y }})</dd>
        </div>
        <div>
          <dt>方向</dt>
          <dd class="num">{{ detail.direction }}°</dd>
        </div>
        <div>
          <dt>任务 ID</dt>
          <dd class="num">{{ detail.taskId === null ? '—' : detail.taskId }}</dd>
        </div>
        <div>
          <dt>路径索引</dt>
          <dd class="num">{{ detail.pathIndex }}</dd>
        </div>
        <div>
          <dt>规划路径</dt>
          <dd class="num">{{ detail.plannedPath.length }} 个点</dd>
        </div>
        <div>
          <dt>占用路径</dt>
          <dd class="num">{{ detail.agvPaths.length }} 个点</dd>
        </div>
        <div>
          <dt>充电状态</dt>
          <dd>{{ detail.isCharge === 1 ? '充电中' : '未充电' }}</dd>
        </div>
        <div>
          <dt>最后更新</dt>
          <dd class="num">{{ formatTime(detail.lastUpdate) }}</dd>
        </div>
        <div class="full">
          <dt>描述</dt>
          <dd>{{ detail.description || '—' }}</dd>
        </div>
      </dl>
      <div v-if="detail.plannedPath.length" class="path-preview">
        <p class="field-label">规划路径预览（前 12 个点）</p>
        <div class="path-chips">
          <span
            v-for="(node, index) in detail.plannedPath.slice(0, 12)"
            :key="index"
            class="path-chip num"
          >
            {{ node.x }},{{ node.y }}
          </span>
          <span v-if="detail.plannedPath.length > 12" class="path-chip more">
            +{{ detail.plannedPath.length - 12 }}
          </span>
        </div>
      </div>
    </template>
    <EmptyState
      v-else
      compact
      title="未能加载车辆详情"
      description="该车辆可能已不存在，或后端返回了空数据。"
    />
  </AppDrawer>
</template>

<style scoped>
.search-input {
  width: 220px;
}

.batch-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 12px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card);
}

.batch-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.code-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 12.5px;
  white-space: nowrap;
}

.code-cell .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.nowrap {
  white-space: nowrap;
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

.speed-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.warning-hint {
  color: var(--orange-text);
}

.speed-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  justify-content: center;
}

.speed-value .num {
  font-size: 38px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--text);
}

.speed-value small {
  font-size: 13px;
  color: var(--text-tertiary);
}

.preset-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.report-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.selected-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}

.selected-head strong {
  font-size: 16px;
  letter-spacing: -0.01em;
}

.big-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 18px;
  margin: 0;
}

.detail-grid > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 12.5px;
}

.detail-grid > div.full {
  grid-column: 1 / -1;
}

.detail-grid dt {
  color: var(--text-tertiary);
  white-space: nowrap;
}

.detail-grid dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  word-break: break-word;
}

.path-preview {
  margin-top: 18px;
}

.path-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.path-chip {
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  font-size: 11.5px;
  color: var(--text-secondary);
}

.path-chip.more {
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .search-input {
    width: 100%;
  }

  .batch-add {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
