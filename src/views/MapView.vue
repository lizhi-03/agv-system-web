<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgvMapCanvas from '../components/AgvMapCanvas.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppDrawer from '../components/ui/AppDrawer.vue'
import AppModal from '../components/ui/AppModal.vue'
import AppSlider from '../components/ui/AppSlider.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppTooltip from '../components/ui/AppTooltip.vue'
import BatteryBar from '../components/ui/BatteryBar.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { getAgv } from '../api/agv'
import { liveStatus } from '../api/live'
import { useAgvCommand } from '../composables/useAgvCommand'
import { useLiveState } from '../composables/useLiveState'
import { toast } from '../composables/useToast'
import type { AgvSnapshot, Station } from '../types'
import { agvColor } from '../utils/colors'
import { formatClock, formatTime } from '../utils/labels'
import { canStart, canStop, startBlockReason, stopBlockReason } from '../utils/agvRules'

interface MapCanvasApi {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  oneToOne: () => void
  focusCell: (x: number, y: number, zoom?: number) => void
}

const route = useRoute()
const router = useRouter()

const live = useLiveState({ runningInterval: 1000, idleInterval: 5000 })
const mapData = live.mapData
const agvs = live.agvs
const errorText = live.errorText
const booted = live.booted
const selectedCode = ref<string | null>(null)
const selectedStation = ref<Station | null>(null)
const showGrid = ref(true)
const showPaths = ref(true)
const showLabels = ref(true)
const panelOpen = ref(false)
const zoomPercent = ref(100)
const isFullscreen = ref(false)
const shellRef = ref<HTMLElement | null>(null)
const canvasRef = ref<MapCanvasApi | null>(null)

const speedOpen = ref(false)
const speedValue = ref(150)
const speedCar = ref<AgvSnapshot | null>(null)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<AgvSnapshot | null>(null)

const running = computed({
  get: () => !live.paused.value,
  set: (value: boolean) => {
    if (value) live.start()
    else live.stop()
  },
})
const refresh = (): void => live.refresh()
const command = useAgvCommand(() => live.refresh())

const dataSourceText = computed(() => {
  switch (liveStatus.mode) {
    case 'stream':
      return '实时推送'
    case 'poll':
      return '轮询 1s / 5s 自适应'
    case 'list':
      return '轮询（兼容接口）'
    default:
      return '连接中'
  }
})
const lastPushText = computed(() => (liveStatus.lastAt ? formatClock(liveStatus.lastAt) : '—'))

watch(agvs, (cars) => {
  if (selectedCode.value && !cars.some((car) => car.agvCode === selectedCode.value)) {
    selectedCode.value = null
  }
})

const selectedAgv = computed(
  () => agvs.value.find((car) => car.agvCode === selectedCode.value) ?? null,
)

const mapLabel = computed(() => {
  const map = mapData.value
  if (!map) return '暂未获取到当前地图'
  return `${map.mapName || map.mapCode || '未命名地图'} · ${map.width} × ${map.height} · v${map.version ?? 1}`
})

const stationTypeText = computed(() =>
  selectedStation.value?.type === 'charge' ? '充电站' : '站点',
)

function onAgvClick(payload: { code: string }): void {
  selectedCode.value = payload.code
  selectedStation.value = null
}

function onStationClick(payload: { station: Station }): void {
  selectedStation.value = payload.station
  selectedCode.value = null
}

function clearSelection(): void {
  selectedCode.value = null
  selectedStation.value = null
}

function focusAgv(code: string): void {
  const car = agvs.value.find((item) => item.agvCode === code)
  if (!car) return
  selectedCode.value = code
  selectedStation.value = null
  canvasRef.value?.focusCell(car.x, car.y, 2.4)
  panelOpen.value = false
}

function onStart(car: AgvSnapshot): void {
  if (!canStart(car)) {
    toast.warning(startBlockReason(car))
    return
  }
  void command.start(car)
}

function onStop(car: AgvSnapshot): void {
  if (!canStop(car)) {
    toast.warning(stopBlockReason(car))
    return
  }
  void command.stop(car)
}

function onCharge(car: AgvSnapshot): void {
  void command.charge(car)
}

function openSpeed(car: AgvSnapshot): void {
  speedCar.value = car
  speedValue.value = Math.round(car.speed)
  speedOpen.value = true
}

async function saveSpeed(): Promise<void> {
  const car = speedCar.value
  if (!car) return
  const ok = await command.speed(car, speedValue.value)
  if (ok) speedOpen.value = false
}

async function openDetail(car: AgvSnapshot): Promise<void> {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await getAgv(car.agvCode, true)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '加载车辆详情失败')
  } finally {
    detailLoading.value = false
  }
}

function startTaskFromStation(role: 'start' | 'end'): void {
  const station = selectedStation.value
  if (!station) return
  const query: Record<string, string> = { wizard: '1' }
  if (role === 'start') query.start = station.id
  else query.end = station.id
  void router.push({ path: '/task', query })
}

function toggleFullscreen(): void {
  const shell = shellRef.value
  if (!shell) return
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void shell.requestFullscreen().catch(() => toast.warning('当前浏览器不支持全屏'))
  }
}

function onFullscreenChange(): void {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') clearSelection()
}

function applyQuerySelection(): void {
  const code = typeof route.query.agv === 'string' ? route.query.agv : ''
  if (!code) return
  if (agvs.value.some((car) => car.agvCode === code)) {
    focusAgv(code)
  }
}

watch(
  () => route.query.agv,
  () => {
    applyQuerySelection()
  },
)

watch(
  () => agvs.value.length,
  () => {
    applyQuerySelection()
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  applyQuerySelection()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" @click="refresh">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
    <AppButton size="sm" variant="primary" @click="router.push({ path: '/task', query: { wizard: '1' } })">
      <Icon name="plus" :size="14" />
      新建任务
    </AppButton>
  </Teleport>

  <div ref="shellRef" class="map-shell">
    <AgvMapCanvas
      ref="canvasRef"
      class="map-canvas-full"
      :map="mapData"
      :agvs="agvs"
      :selected-code="selectedCode"
      :selected-station-id="selectedStation?.id ?? null"
      :show-grid="showGrid"
      :show-paths="showPaths"
      :show-labels="showLabels"
      :empty-text="booted ? '暂未获取到当前地图' : '正在加载地图…'"
      @agv-click="onAgvClick"
      @station-click="onStationClick"
      @background-click="clearSelection"
      @viewport-change="zoomPercent = $event.percent"
    />

    <!-- 左上：地图信息 + 轮询状态 -->
    <div class="float map-info glass">
      <div class="map-info-title">
        <Icon name="map" :size="16" />
        <strong>{{ mapLabel }}</strong>
      </div>
      <div class="map-info-meta">
        <span class="poll-state" :data-active="running">
          <i />
          {{ running ? '实时同步' : '已暂停' }}
        </span>
        <span>数据源 {{ dataSourceText }}</span>
        <span class="num">最后 {{ lastPushText }}</span>
        <span v-if="agvs.length" class="num">车辆 {{ agvs.length }}</span>
        <span v-if="mapData" class="num">
          {{ mapData.stations.length }} 站点 · {{ mapData.obstacles.length }} 障碍
        </span>
        <button type="button" class="mini-btn" @click="running = !running">
          {{ running ? '暂停' : '继续' }}
        </button>
      </div>
    </div>

    <!-- 右上：缩放与全屏 -->
    <div class="float zoom-bar glass">
      <button type="button" class="zoom-btn" aria-label="缩小" @click="canvasRef?.zoomOut()">
        <Icon name="minus" :size="15" />
      </button>
      <span class="zoom-percent num">{{ zoomPercent }}%</span>
      <button type="button" class="zoom-btn" aria-label="放大" @click="canvasRef?.zoomIn()">
        <Icon name="plus" :size="15" />
      </button>
      <span class="zoom-divider" />
      <AppTooltip content="适应窗口">
        <button type="button" class="zoom-btn" aria-label="适应窗口" @click="canvasRef?.fit()">
          <Icon name="expand" :size="15" />
        </button>
      </AppTooltip>
      <AppTooltip content="1:1 实际尺寸">
        <button type="button" class="zoom-btn text" aria-label="1:1" @click="canvasRef?.oneToOne()">
          1:1
        </button>
      </AppTooltip>
      <AppTooltip :content="isFullscreen ? '退出全屏' : '全屏'">
        <button type="button" class="zoom-btn" aria-label="全屏" @click="toggleFullscreen">
          <Icon :name="isFullscreen ? 'exit-fullscreen' : 'fullscreen'" :size="15" />
        </button>
      </AppTooltip>
      <span class="zoom-divider" />
      <AppTooltip :content="panelOpen ? '收起车辆面板' : '展开车辆面板'">
        <button
          type="button"
          class="zoom-btn"
          :class="{ active: panelOpen }"
          aria-label="车辆面板"
          @click="panelOpen = !panelOpen"
        >
          <Icon name="agv" :size="15" />
        </button>
      </AppTooltip>
    </div>

    <!-- 右上：显示开关与图例 -->
    <div class="float legend-panel glass">
      <div class="legend-switches">
        <AppSwitch v-model="showGrid" size="sm" label="网格" />
        <AppSwitch v-model="showPaths" size="sm" label="路径" />
        <AppSwitch v-model="showLabels" size="sm" label="标签" />
      </div>
      <div class="legend-items">
        <span><i class="swatch obstacle" />障碍</span>
        <span><i class="swatch station" />站点</span>
        <span><i class="swatch charge" />充电站</span>
        <span><i class="swatch vehicle" />AGV</span>
        <span><i class="swatch path" />规划路径</span>
      </div>
    </div>

    <!-- 车辆浮动操作条 -->
    <Transition name="fade">
      <div v-if="selectedAgv" class="float action-bar glass">
        <div class="action-head">
          <i class="action-dot" :style="{ background: agvColor(selectedAgv.agvCode) }" />
          <strong>{{ selectedAgv.agvCode }}</strong>
          <StatusPill :status="selectedAgv.status" kind="agv" />
          <span class="action-meta num">
            <BatteryBar :value="selectedAgv.battery" width="52px" />
            ({{ selectedAgv.x }}, {{ selectedAgv.y }})
          </span>
          <button type="button" class="mini-btn" aria-label="关闭" @click="clearSelection">
            <Icon name="close" :size="13" />
          </button>
        </div>
        <div class="action-buttons">
          <AppTooltip :content="startBlockReason(selectedAgv)">
            <AppButton
              size="md"
              variant="tint"
              :disabled="command.busy.value || !canStart(selectedAgv)"
              @click="onStart(selectedAgv)"
            >
              <Icon name="play" :size="15" />
              启动
            </AppButton>
          </AppTooltip>
          <AppTooltip :content="stopBlockReason(selectedAgv)">
            <AppButton
              size="md"
              variant="secondary"
              :disabled="command.busy.value || !canStop(selectedAgv)"
              @click="onStop(selectedAgv)"
            >
              <Icon name="pause" :size="15" />
              暂停
            </AppButton>
          </AppTooltip>
          <AppButton size="md" variant="secondary" :disabled="command.busy.value" @click="openSpeed(selectedAgv)">
            <Icon name="gauge" :size="15" />
            调速
          </AppButton>
          <AppButton size="md" variant="secondary" :disabled="command.busy.value" @click="onCharge(selectedAgv)">
            <Icon name="bolt" :size="15" />
            充电
          </AppButton>
          <AppButton size="md" variant="primary" @click="openDetail(selectedAgv)">
            <Icon name="info" :size="15" />
            详情
          </AppButton>
        </div>
      </div>
    </Transition>

    <!-- 站点浮动操作条 -->
    <Transition name="fade">
      <div v-if="selectedStation" class="float action-bar glass station-bar">
        <div class="action-head">
          <i class="action-dot" :style="{ background: selectedStation.type === 'charge' ? 'var(--orange)' : 'var(--accent)' }" />
          <strong>{{ selectedStation.id }}</strong>
          <span class="action-meta">{{ stationTypeText }} · ({{ selectedStation.x }}, {{ selectedStation.y }})</span>
          <button type="button" class="mini-btn" aria-label="关闭" @click="selectedStation = null">
            <Icon name="close" :size="13" />
          </button>
        </div>
        <div class="action-buttons">
          <AppButton size="md" variant="tint" @click="startTaskFromStation('start')">
            <Icon name="pin" :size="15" />
            设为起点
          </AppButton>
          <AppButton size="md" variant="secondary" @click="startTaskFromStation('end')">
            <Icon name="flag" :size="15" />
            设为终点
          </AppButton>
        </div>
      </div>
    </Transition>

    <!-- 车辆面板 -->
    <Transition name="fade">
      <aside v-if="panelOpen" class="vehicle-panel glass">
        <div class="panel-head">
          <strong>车辆 {{ agvs.length }}</strong>
          <button type="button" class="mini-btn" aria-label="收起" @click="panelOpen = false">
            <Icon name="close" :size="13" />
          </button>
        </div>
        <ul v-if="agvs.length" class="panel-list">
          <li v-for="car in agvs" :key="car.agvCode">
            <button
              type="button"
              class="panel-item"
              :class="{ active: car.agvCode === selectedCode }"
              @click="focusAgv(car.agvCode)"
            >
              <i class="action-dot" :style="{ background: agvColor(car.agvCode) }" />
              <span class="panel-code">{{ car.agvCode }}</span>
              <StatusPill :status="car.status" kind="agv" />
              <span class="panel-pos num">({{ car.x }}, {{ car.y }})</span>
            </button>
          </li>
        </ul>
        <p v-else class="panel-empty">暂无车辆</p>
      </aside>
    </Transition>

    <!-- 底部提示 -->
    <div class="float map-hint glass">
      <Icon name="info" :size="13" />
      滚轮缩放 · 拖拽平移 · 双击放大 · 点击车辆/站点直接操作
    </div>

    <div v-if="!booted" class="map-loading">
      <SkeletonBlock height="100%" radius="12px" />
    </div>

    <div v-if="errorText" class="float map-error glass">
      <Icon name="alert" :size="14" />
      <span>{{ errorText }}</span>
      <AppButton size="sm" variant="secondary" @click="refresh">重试</AppButton>
    </div>
  </div>

  <AppModal
    v-model="speedOpen"
    title="调节速度"
    :subtitle="speedCar ? `${speedCar.agvCode} · 当前 ${Math.round(speedCar.speed)} cm/s` : ''"
    :width="420"
    :loading="command.busy.value"
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
          v-for="preset in [50, 100, 150, 200, 300]"
          :key="preset"
          size="sm"
          :variant="speedValue === preset ? 'primary' : 'secondary'"
          @click="speedValue = preset"
        >
          {{ preset }}
        </AppButton>
      </div>
    </div>
  </AppModal>

  <AppDrawer
    v-model="detailOpen"
    :title="detail?.agvCode || '车辆详情'"
    subtitle="GET /agv/{agvCode} 实时快照"
    :width="420"
  >
    <div v-if="detailLoading" class="stack">
      <SkeletonBlock v-for="index in 6" :key="index" height="20px" />
    </div>
    <template v-else-if="detail">
      <div class="detail-head">
        <i class="action-dot" :style="{ background: agvColor(detail.agvCode) }" />
        <strong>{{ detail.agvCode }}</strong>
        <StatusPill :status="detail.status" kind="agv" />
      </div>
      <div class="detail-grid">
        <div><dt>电量</dt><dd><BatteryBar :value="detail.battery" width="90px" /></dd></div>
        <div><dt>速度</dt><dd class="num">{{ Math.round(detail.speed) }} cm/s</dd></div>
        <div><dt>坐标</dt><dd class="num">({{ detail.x }}, {{ detail.y }})</dd></div>
        <div><dt>方向</dt><dd class="num">{{ detail.direction }}°</dd></div>
        <div><dt>任务 ID</dt><dd class="num">{{ detail.taskId ?? '—' }}</dd></div>
        <div><dt>规划路径</dt><dd class="num">{{ detail.plannedPath.length }} 点</dd></div>
        <div class="full"><dt>最后更新</dt><dd>{{ formatTime(detail.lastUpdate) }}</dd></div>
        <div class="full"><dt>描述</dt><dd>{{ detail.description || '—' }}</dd></div>
      </div>
    </template>
    <p v-else class="error-note">未能加载车辆详情</p>
  </AppDrawer>
</template>

<style scoped>
.map-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: hidden;
  background: var(--bg);
}

.map-shell:fullscreen {
  height: 100vh;
  flex: none;
  background: var(--bg);
}

.map-shell :deep(.map-canvas) {
  border-radius: 0;
  min-height: 0;
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

.map-info {
  top: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 14px;
  max-width: min(460px, calc(100% - 460px));
}

.map-info-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  min-width: 0;
}

.map-info-title strong {
  font-size: 13.5px;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-info-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.poll-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.poll-state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.poll-state[data-active='true'] i {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-tint);
}

.mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.mini-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.zoom-bar {
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
}

.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: var(--text-secondary);
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.zoom-btn.text {
  width: auto;
  padding: 0 8px;
  font-size: 11.5px;
  font-weight: 600;
}

.zoom-btn:hover,
.zoom-btn.active {
  background: var(--surface-subtle);
  color: var(--accent);
}

.zoom-percent {
  min-width: 46px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.zoom-divider {
  width: 1px;
  height: 20px;
  background: var(--separator);
  margin: 0 2px;
}

.legend-panel {
  top: 64px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 12px;
  max-width: 250px;
}

.legend-switches {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.legend-items {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-items span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}

.swatch.obstacle {
  background: var(--map-obstacle);
}

.swatch.station {
  background: var(--map-station);
  border-radius: 50%;
}

.swatch.charge {
  background: var(--map-charge);
  border-radius: 50%;
}

.swatch.vehicle {
  background: linear-gradient(90deg, #0a84ff, #30d158);
  border-radius: 4px;
}

.swatch.path {
  width: 14px;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
}

.action-bar {
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  max-width: calc(100% - 32px);
}

.action-head {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.action-head strong {
  font-size: 14px;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.action-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.action-head .mini-btn {
  margin-left: auto;
}

.action-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.station-bar {
  bottom: 22px;
}

.vehicle-panel {
  position: absolute;
  top: 64px;
  right: 16px;
  bottom: 96px;
  z-index: 6;
  width: 270px;
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  font-size: 13px;
}

.panel-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  flex: 1;
}

.panel-item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  grid-template-areas:
    'dot code pill'
    'dot pos pos';
  align-items: center;
  gap: 2px 8px;
  width: 100%;
  padding: 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  transition: background-color var(--dur) var(--ease);
}

.panel-item:hover {
  background: var(--surface-subtle);
}

.panel-item.active {
  background: var(--accent-tint);
}

.panel-item .action-dot {
  grid-area: dot;
}

.panel-code {
  grid-area: code;
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-item :deep(.pill) {
  grid-area: pill;
}

.panel-pos {
  grid-area: pos;
  font-size: 11px;
  color: var(--text-tertiary);
}

.panel-empty {
  padding: 16px 6px;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.map-hint {
  left: 16px;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.map-loading {
  position: absolute;
  inset: 16px;
  z-index: 4;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.map-error {
  left: 16px;
  bottom: 60px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  font-size: 12.5px;
  color: var(--red-text);
  max-width: calc(100% - 32px);
}

.map-error span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.speed-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.speed-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
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

.detail-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}

.detail-head strong {
  font-size: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
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

@media (max-width: 1100px) {
  .legend-panel {
    display: none;
  }

  .map-info {
    max-width: calc(100% - 380px);
  }
}

@media (max-width: 768px) {
  .map-info {
    max-width: calc(100% - 100px);
  }

  .map-info-meta {
    display: none;
  }

  .zoom-bar {
    gap: 0;
    padding: 3px;
  }

  .zoom-btn {
    width: 28px;
    height: 28px;
  }

  .zoom-percent {
    min-width: 40px;
    font-size: 11px;
  }

  .vehicle-panel {
    width: calc(100% - 32px);
    right: 16px;
    left: 16px;
  }

  .action-bar {
    bottom: 12px;
    padding: 10px;
  }

  .action-meta {
    display: none;
  }

  .map-hint {
    display: none;
  }
}
</style>
