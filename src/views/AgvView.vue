<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import AppDrawer from '../components/ui/AppDrawer.vue'
import AppInput from '../components/ui/AppInput.vue'
import AppModal from '../components/ui/AppModal.vue'
import AppNumberField from '../components/ui/AppNumberField.vue'
import AppSegmented from '../components/ui/AppSegmented.vue'
import AppSlider from '../components/ui/AppSlider.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppTooltip from '../components/ui/AppTooltip.vue'
import BatteryBar from '../components/ui/BatteryBar.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { batchAgv, getAgv, reportAgv } from '../api/agv'
import { confirmDialog } from '../composables/useConfirm'
import { useAgvCommand } from '../composables/useAgvCommand'
import { useLiveState } from '../composables/useLiveState'
import { toast } from '../composables/useToast'
import type { AgvSnapshot } from '../types'
import { agvColor } from '../utils/colors'
import { canStart, canStop, startBlockReason, stopBlockReason } from '../utils/agvRules'
import { formatTime } from '../utils/labels'

const router = useRouter()

// 与概览/地图页共用同一实时通道（SSE 优先，降级自适应轮询），不再单独 2s 轮询 /agv/list
const live = useLiveState({ runningInterval: 1000, idleInterval: 5000, withMap: false })
const agvs = live.agvs
const errorText = live.errorText
const loading = computed(() => !live.booted.value)
const search = ref('')
const statusFilter = ref('all')
const batchCount = ref(1)
const batchBusy = ref(false)
const newCodes = ref<string[]>([])
let newCodeTimer = 0

const drawerOpen = ref(false)
const drawerDetail = ref<AgvSnapshot | null>(null)
const drawerLoading = ref(false)
const drawerSpeed = ref(150)
const drawerSavingSpeed = ref(false)

const reportOpen = ref(false)
const reportX = ref(0)
const reportY = ref(0)
const current = ref<AgvSnapshot | null>(null)

const refresh = (): Promise<void> => live.refresh()
const command = useAgvCommand(refresh)

const running = computed({
  get: () => !live.paused.value,
  set: (value: boolean) => {
    if (value) live.start()
    else live.stop()
  },
})

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
    { value: 'stopping', label: `暂停 ${count('stopping')}` },
    { value: 'error', label: `异常 ${count('error')}` },
  ]
})

const drawerCar = computed<AgvSnapshot | null>(() => {
  const code = drawerDetail.value?.agvCode
  if (!code) return null
  return agvs.value.find((car) => car.agvCode === code) ?? drawerDetail.value
})

const isNew = (code: string): boolean => newCodes.value.includes(code)

function onCardClick(car: AgvSnapshot): void {
  void openDrawer(car)
}

async function openDrawer(car: AgvSnapshot): Promise<void> {
  drawerOpen.value = true
  drawerLoading.value = true
  drawerDetail.value = car
  drawerSpeed.value = Math.round(car.speed)
  try {
    const detail = await getAgv(car.agvCode, true)
    if (detail) drawerDetail.value = detail
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '加载车辆详情失败')
  } finally {
    drawerLoading.value = false
  }
}

function closeDrawer(): void {
  drawerOpen.value = false
  drawerDetail.value = null
}

function start(car: AgvSnapshot): void {
  if (!canStart(car)) {
    toast.warning(startBlockReason(car))
    return
  }
  void command.start(car)
}

function stop(car: AgvSnapshot): void {
  if (!canStop(car)) {
    toast.warning(stopBlockReason(car))
    return
  }
  void command.stop(car)
}

function charge(car: AgvSnapshot): void {
  void command.charge(car)
}

async function saveDrawerSpeed(): Promise<void> {
  const car = drawerCar.value
  if (!car || drawerSavingSpeed.value) return
  drawerSavingSpeed.value = true
  try {
    await command.speed(car, drawerSpeed.value)
  } finally {
    drawerSavingSpeed.value = false
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
  await command.run(
    'report',
    () =>
      reportAgv({
        agvCode: car.agvCode,
        x: Math.round(reportX.value),
        y: Math.round(reportY.value),
      }),
    '位置已上报',
  )
  reportOpen.value = false
}

function viewOnMap(car: AgvSnapshot): void {
  closeDrawer()
  void router.push({ path: '/map', query: { agv: car.agvCode } })
}

async function addCars(): Promise<void> {
  if (batchBusy.value || command.busy.value) return
  batchBusy.value = true
  try {
    const count = batchCount.value
    const confirmed = await confirmDialog({
      title: '批量加车',
      message: `将新增 ${count} 辆车，后端返回的编号会自动分配（连续、不重复）。`,
      detail: 'V2 后端新车可直接派发任务并会移动；按钮在确认/请求期间会禁用，避免重复加车。',
      confirmLabel: '确认添加',
    })
    if (!confirmed) return
    const codes = await batchAgv(count)
    await refresh()
    if (codes.length) {
      newCodes.value = codes
      if (newCodeTimer) window.clearTimeout(newCodeTimer)
      newCodeTimer = window.setTimeout(() => {
        newCodes.value = []
      }, 10000)
      toast.success(`已添加 ${codes.length} 辆车`, codes.join('、') + '（已高亮，可直接派任务）')
    } else {
      toast.success(`已提交加车（${count} 辆）`, '列表刷新后显示新车')
    }
  } catch {
    /* http 层已提示 */
  } finally {
    batchBusy.value = false
  }
}

onUnmounted(() => {
  if (newCodeTimer) window.clearTimeout(newCodeTimer)
})
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" :loading="false" @click="refresh">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
    <AppButton size="sm" variant="primary" @click="router.push('/map')">
      <Icon name="map" :size="14" />
      实时地图
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
          :loading="batchBusy"
          :disabled="command.busy.value || batchBusy"
          @click="addCars"
        >
          <Icon name="plus" :size="14" />
          批量加车
        </AppButton>
      </div>
      <AppSwitch v-model="running" size="sm" label="实时更新" />
    </div>

    <div v-if="loading && !agvs.length" class="agv-grid">
      <SkeletonBlock v-for="index in 6" :key="index" height="196px" radius="20px" />
    </div>

    <div v-else-if="errorText && !agvs.length" class="notice-card card">
      <EmptyState title="无法加载车辆列表" :description="`${errorText}。请确认后端服务已启动后重试。`">
        <AppButton variant="primary" @click="refresh">
          <Icon name="refresh" :size="14" />
          重试
        </AppButton>
      </EmptyState>
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      class="card"
      :title="agvs.length ? '没有匹配的车辆' : '暂无车辆'"
      :description="agvs.length ? '试试更换状态筛选或清空搜索关键字。' : '点击「批量加车」创建车辆，新车可直接派发任务。'"
    >
      <AppButton v-if="agvs.length" size="sm" variant="secondary" @click="((search = ''), (statusFilter = 'all'))">
        清空筛选
      </AppButton>
    </EmptyState>

    <div v-else class="agv-grid">
      <article
        v-for="car in filtered"
        :key="car.agvCode"
        class="agv-card"
        :class="{ 'is-new': isNew(car.agvCode) }"
        @click="onCardClick(car)"
      >
        <header class="agv-card-head">
          <span class="agv-code">
            <i class="agv-dot" :style="{ background: agvColor(car.agvCode) }" />
            {{ car.agvCode }}
          </span>
          <StatusPill :status="car.status" kind="agv" />
          <span v-if="isNew(car.agvCode)" class="new-badge">新</span>
        </header>

        <div class="agv-battery">
          <BatteryBar :value="car.battery" width="100%" />
        </div>

        <dl class="agv-meta">
          <div><dt>位置</dt><dd class="num">({{ car.x }}, {{ car.y }})</dd></div>
          <div><dt>速度</dt><dd class="num">{{ Math.round(car.speed) }} cm/s</dd></div>
          <div><dt>任务</dt><dd class="num">{{ car.taskId === null ? '无' : `#${car.taskId}` }}</dd></div>
          <div><dt>更新</dt><dd class="num">{{ formatTime(car.lastUpdate) }}</dd></div>
        </dl>

        <footer class="agv-card-actions" @click.stop>
          <AppButton size="sm" variant="secondary" :disabled="command.busy.value || !canStart(car)" @click="start(car)">
            <Icon name="play" :size="14" />
            启动
          </AppButton>
          <AppButton size="sm" variant="secondary" :disabled="command.busy.value || !canStop(car)" @click="stop(car)">
            <Icon name="pause" :size="14" />
            暂停
          </AppButton>
          <AppButton size="sm" variant="tint" @click="onCardClick(car)">
            <Icon name="arrow-right" :size="14" />
            详情
          </AppButton>
        </footer>
      </article>
    </div>
  </div>

  <!-- 车辆详情抽屉 -->
  <AppDrawer
    v-model="drawerOpen"
    :title="drawerCar?.agvCode || '车辆详情'"
    :subtitle="drawerCar ? `状态：${drawerCar.status} · 位置 (${drawerCar.x}, ${drawerCar.y})` : ''"
    :width="460"
  >
    <div v-if="drawerLoading && !drawerDetail" class="stack">
      <SkeletonBlock v-for="index in 6" :key="index" height="20px" />
    </div>
    <template v-else-if="drawerCar">
      <div class="drawer-hero">
        <span class="hero-code">
          <i class="agv-dot big" :style="{ background: agvColor(drawerCar.agvCode) }" />
          {{ drawerCar.agvCode }}
        </span>
        <StatusPill :status="drawerCar.status" kind="agv" />
        <span class="hero-pos num">({{ drawerCar.x }}, {{ drawerCar.y }})</span>
      </div>

      <div class="drawer-battery">
        <BatteryBar :value="drawerCar.battery" width="100%" />
      </div>

      <div class="hero-actions">
        <AppTooltip :content="startBlockReason(drawerCar)">
          <AppButton
            size="md"
            variant="tint"
            block
            :disabled="command.busy.value || !canStart(drawerCar)"
            @click="start(drawerCar)"
          >
            <Icon name="play" :size="16" />
            启动
          </AppButton>
        </AppTooltip>
        <AppTooltip :content="stopBlockReason(drawerCar)">
          <AppButton
            size="md"
            variant="secondary"
            block
            :disabled="command.busy.value || !canStop(drawerCar)"
            @click="stop(drawerCar)"
          >
            <Icon name="pause" :size="16" />
            暂停
          </AppButton>
        </AppTooltip>
        <AppButton size="md" variant="secondary" block :disabled="command.busy.value" @click="charge(drawerCar)">
          <Icon name="bolt" :size="16" />
          充电
        </AppButton>
        <AppButton size="md" variant="secondary" block @click="viewOnMap(drawerCar)">
          <Icon name="map" :size="16" />
          在地图查看
        </AppButton>
        <AppButton size="md" variant="secondary" block @click="openReport(drawerCar)">
          <Icon name="crosshair" :size="16" />
          上报位置
        </AppButton>
        <AppButton size="md" variant="primary" block @click="saveDrawerSpeed">
          <Icon name="gauge" :size="16" />
          保存速度
        </AppButton>
      </div>

      <section class="drawer-section">
        <div class="section-head">
          <span>调速</span>
          <span class="speed-live num">{{ drawerSpeed }} cm/s</span>
        </div>
        <AppSlider v-model="drawerSpeed" :min="0" :max="1000" :step="10" aria-label="速度" />
        <div class="preset-row">
          <AppButton
            v-for="preset in [50, 100, 150, 200, 300]"
            :key="preset"
            size="sm"
            :variant="drawerSpeed === preset ? 'primary' : 'secondary'"
            @click="drawerSpeed = preset"
          >
            {{ preset }}
          </AppButton>
        </div>
        <p v-if="drawerCar.taskId === null" class="field-hint warning-hint">
          空闲车辆速度会被模拟器重置为 0，建议在运行中车辆上调速。
        </p>
      </section>

      <section class="drawer-section">
        <div class="section-head"><span>运行详情</span></div>
        <dl class="detail-grid">
          <div><dt>方向</dt><dd class="num">{{ drawerDetail?.direction ?? drawerCar.direction }}°</dd></div>
          <div><dt>任务 ID</dt><dd class="num">{{ drawerDetail?.taskId ?? drawerCar.taskId ?? '—' }}</dd></div>
          <div><dt>规划路径</dt><dd class="num">{{ drawerDetail?.plannedPath.length ?? 0 }} 点</dd></div>
          <div><dt>路径索引</dt><dd class="num">{{ drawerDetail?.pathIndex ?? 0 }}</dd></div>
          <div><dt>充电状态</dt><dd>{{ (drawerDetail?.isCharge ?? drawerCar.isCharge) === 1 ? '充电中' : '未充电' }}</dd></div>
          <div><dt>最后更新</dt><dd class="num">{{ formatTime(drawerCar.lastUpdate) }}</dd></div>
          <div class="full"><dt>描述</dt><dd>{{ drawerDetail?.description || drawerCar.description || '—' }}</dd></div>
        </dl>
      </section>
    </template>
  </AppDrawer>

  <!-- 上报位置 -->
  <AppModal
    v-model="reportOpen"
    title="上报位置"
    :subtitle="current ? `${current.agvCode} · 当前 (${current.x}, ${current.y})` : ''"
    :width="420"
    :loading="command.busy.value"
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
        后端为合并语义：仅提交坐标，taskId / plannedPath 等任务字段自动保留。
      </p>
    </div>
  </AppModal>
</template>

<style scoped>
.search-input {
  width: 210px;
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

.card {
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 20px;
}

.agv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.agv-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition:
    transform var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}

.agv-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

.agv-card.is-new {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring), var(--shadow-card);
}

.agv-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agv-code {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agv-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}

.agv-dot.big {
  width: 12px;
  height: 12px;
}

.new-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
}

.agv-card-head :deep(.pill) {
  margin-left: auto;
}

.agv-battery {
  display: flex;
}

.agv-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0;
}

.agv-meta > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 11.5px;
}

.agv-meta dt {
  color: var(--text-tertiary);
  white-space: nowrap;
}

.agv-meta dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agv-card-actions {
  display: flex;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--separator);
}

.agv-card-actions :deep(.btn) {
  flex: 1;
}

.drawer-hero {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.hero-code {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.hero-pos {
  font-size: 12px;
  color: var(--text-secondary);
}

.drawer-battery {
  display: flex;
  margin-bottom: 14px;
}

.hero-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  margin-bottom: 12px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.speed-live {
  font-size: 15px;
  font-weight: 600;
  color: var(--accent);
}

.preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.warning-hint {
  color: var(--orange-text);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
  margin: 0;
}

.detail-grid > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 12px;
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

.report-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 768px) {
  .search-input {
    width: 100%;
  }

  .batch-add {
    width: 100%;
    justify-content: space-between;
  }

  .hero-actions {
    grid-template-columns: 1fr;
  }
}
</style>
