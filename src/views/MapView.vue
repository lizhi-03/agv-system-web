<script setup lang="ts">
import { computed, ref } from 'vue'
import AgvMapCanvas from '../components/AgvMapCanvas.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import BatteryBar from '../components/ui/BatteryBar.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { listAgv } from '../api/agv'
import { getCurrentMap } from '../api/map'
import { usePolling } from '../composables/usePolling'
import type { AgvMap, AgvSnapshot } from '../types'
import { agvColor } from '../utils/colors'
import { formatTime } from '../utils/labels'

const mapData = ref<AgvMap | null>(null)
const agvs = ref<AgvSnapshot[]>([])
const errorText = ref('')
const booted = ref(false)
const selectedCode = ref<string | null>(null)
const showGrid = ref(true)
const showPaths = ref(true)
const showLabels = ref(true)

async function load(): Promise<void> {
  try {
    const [map, cars] = await Promise.all([getCurrentMap(true), listAgv(true)])
    mapData.value = map
    agvs.value = cars
    errorText.value = ''
    if (selectedCode.value && !cars.some((car) => car.agvCode === selectedCode.value)) {
      selectedCode.value = null
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '地图数据加载失败'
    throw error
  } finally {
    booted.value = true
  }
}

const poller = usePolling(load, { interval: 1000 })
const { running, refresh, inFlight } = poller

const selected = computed(
  () => agvs.value.find((car) => car.agvCode === selectedCode.value) ?? null,
)

const mapLabel = computed(() => {
  const map = mapData.value
  if (!map) return '暂未获取到当前地图'
  return `${map.mapName || map.mapCode || '未命名地图'} · ${map.width} × ${map.height} 格`
})

const metaRows = computed(() => {
  const map = mapData.value
  if (!map) return []
  return [
    { label: '地图名称', value: map.mapName || '—' },
    { label: '地图编码', value: map.mapCode || '—' },
    { label: '版本', value: `v${map.version ?? 1}` },
    { label: '尺寸', value: `${map.width} × ${map.height}` },
    { label: '站点', value: `${map.stations.length} 个` },
    { label: '充电站', value: `${map.stations.filter((item) => item.type === 'charge').length} 个` },
    { label: '障碍', value: `${map.obstacles.length} 个` },
    { label: '更新时间', value: formatTime(map.updatedAt) },
  ]
})

function selectAgv(code: string): void {
  selectedCode.value = code
}

function togglePolling(): void {
  running.value = !running.value
}
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" @click="togglePolling">
      <Icon :name="running ? 'pause' : 'play'" :size="14" />
      {{ running ? '暂停轮询' : '继续轮询' }}
    </AppButton>
    <AppButton size="sm" variant="primary" :loading="inFlight" @click="refresh">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
  </Teleport>

  <div class="page">
    <div class="map-layout">
      <AppCard title="实时地图" :subtitle="mapLabel" padding="none">
        <template #actions>
          <span class="poll-state" :data-active="running">
            <i />
            {{ running ? '每秒刷新' : '轮询已暂停' }}
          </span>
        </template>
        <div class="map-stage">
          <AgvMapCanvas
            :map="mapData"
            :agvs="agvs"
            :selected-code="selectedCode"
            :show-grid="showGrid"
            :show-paths="showPaths"
            :show-labels="showLabels"
            :empty-text="booted ? '暂未获取到当前地图' : '正在加载地图…'"
            @select-agv="selectAgv"
          >
            <template #overlay>
              <div class="display-toggles glass">
                <AppSwitch v-model="showGrid" size="sm" label="网格" />
                <AppSwitch v-model="showPaths" size="sm" label="路径" />
                <AppSwitch v-model="showLabels" size="sm" label="标签" />
              </div>
            </template>
          </AgvMapCanvas>
          <div v-if="errorText" class="map-error glass">
            <Icon name="alert" :size="14" />
            <span>{{ errorText }}</span>
            <AppButton size="sm" variant="secondary" @click="refresh">重试</AppButton>
          </div>
        </div>
      </AppCard>

      <aside class="map-side">
        <AppCard title="车辆" :subtitle="`共 ${agvs.length} 辆 · 点击选中`">
          <ul v-if="agvs.length" class="car-list">
            <li v-for="car in agvs" :key="car.agvCode">
              <button
                type="button"
                class="car-item"
                :class="{ active: car.agvCode === selectedCode }"
                @click="selectAgv(car.agvCode)"
              >
                <i class="car-dot" :style="{ background: agvColor(car.agvCode) }" />
                <span class="car-code">{{ car.agvCode }}</span>
                <StatusPill :status="car.status" kind="agv" />
                <span class="car-pos num">({{ car.x }}, {{ car.y }})</span>
              </button>
            </li>
          </ul>
          <EmptyState
            v-else
            compact
            title="暂无车辆"
            description="在车队页批量加车后，车辆会实时出现在地图上。"
          />
        </AppCard>

        <AppCard title="选中车辆" subtitle="详情随轮询实时更新">
          <template v-if="selected">
            <div class="selected-head">
              <span class="car-dot" :style="{ background: agvColor(selected.agvCode) }" />
              <strong>{{ selected.agvCode }}</strong>
              <StatusPill :status="selected.status" kind="agv" />
            </div>
            <dl class="detail-list">
              <div class="detail-row">
                <dt>电量</dt>
                <dd><BatteryBar :value="selected.battery" width="96px" /></dd>
              </div>
              <div class="detail-row">
                <dt>速度</dt>
                <dd class="num">{{ Math.round(selected.speed) }} cm/s</dd>
              </div>
              <div class="detail-row">
                <dt>坐标</dt>
                <dd class="num">({{ selected.x }}, {{ selected.y }})</dd>
              </div>
              <div class="detail-row">
                <dt>方向</dt>
                <dd class="num">{{ selected.direction }}°</dd>
              </div>
              <div class="detail-row">
                <dt>当前任务</dt>
                <dd class="num">{{ selected.taskId === null ? '无' : `#${selected.taskId}` }}</dd>
              </div>
              <div class="detail-row">
                <dt>路径进度</dt>
                <dd class="num">
                  {{ selected.pathIndex }} / {{ selected.plannedPath.length }}
                </dd>
              </div>
              <div class="detail-row">
                <dt>最后更新</dt>
                <dd class="num">{{ formatTime(selected.lastUpdate) }}</dd>
              </div>
            </dl>
            <p class="detail-desc">{{ selected.description || '无任务描述' }}</p>
          </template>
          <EmptyState
            v-else
            compact
            title="未选择车辆"
            description="点击地图上的车辆或上方列表即可查看详情。"
          />
        </AppCard>

        <AppCard title="图例">
          <ul class="legend">
            <li><span class="swatch obstacle" />障碍</li>
            <li><span class="swatch station" />站点</li>
            <li><span class="swatch charge" />充电站</li>
            <li><span class="swatch vehicle" />AGV（按编号取色）</li>
            <li><span class="swatch path" />规划路径</li>
            <li><span class="swatch occupied" />已占用路径</li>
          </ul>
        </AppCard>

        <AppCard title="地图信息" subtitle="GET /map/current">
          <dl v-if="metaRows.length" class="meta-list">
            <div v-for="row in metaRows" :key="row.label" class="meta-row">
              <dt>{{ row.label }}</dt>
              <dd class="num">{{ row.value }}</dd>
            </div>
          </dl>
          <p v-else class="error-note">{{ errorText || '暂未获取到地图信息' }}</p>
        </AppCard>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.poll-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.poll-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.poll-state[data-active='true'] i {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-tint);
  animation: map-pulse 1.6s ease-in-out infinite;
}

@keyframes map-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.map-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  gap: 16px;
  align-items: start;
}

.map-stage {
  position: relative;
  height: clamp(520px, calc(100vh - 196px), 1000px);
  padding: 0 14px 14px;
}

.display-toggles {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card);
}

.map-error {
  position: absolute;
  left: 26px;
  bottom: 26px;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 52px);
  padding: 9px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card);
  color: var(--red-text);
  font-size: 12.5px;
}

.map-error span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.car-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
}

.car-item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  grid-template-areas:
    'dot code pill'
    'dot pos pos';
  align-items: center;
  gap: 2px 8px;
  width: 100%;
  padding: 9px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  transition: background-color var(--dur) var(--ease);
}

.car-item:hover {
  background: var(--surface-subtle);
}

.car-item.active {
  background: var(--accent-tint);
}

.car-dot {
  grid-area: dot;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  align-self: center;
}

.car-code {
  grid-area: code;
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.car-item :deep(.pill) {
  grid-area: pill;
}

.car-pos {
  grid-area: pos;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.selected-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.selected-head strong {
  font-size: 15px;
  letter-spacing: -0.01em;
}

.selected-head .car-dot {
  width: 10px;
  height: 10px;
}

.detail-list {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 12.5px;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row dt {
  color: var(--text-tertiary);
}

.detail-row dd {
  margin: 0;
  color: var(--text);
  text-align: right;
}

.detail-desc {
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-subtle);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.swatch {
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 4px;
}

.swatch.obstacle {
  background: var(--map-obstacle);
}

.swatch.station {
  background: var(--map-station);
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--separator-strong);
}

.swatch.charge {
  background: var(--map-charge);
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--separator-strong);
}

.swatch.vehicle {
  background: linear-gradient(90deg, #0a84ff 0 25%, #30d158 25% 50%, #ff9f0a 50% 75%, #bf5af2 75%);
  border-radius: 5px;
}

.swatch.path {
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  opacity: 0.6;
}

.swatch.occupied {
  background: var(--map-occupied);
  border: 1px solid var(--separator-strong);
}

.meta-list {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 12.5px;
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row dt {
  color: var(--text-tertiary);
}

.meta-row dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .map-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .map-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .map-stage {
    height: clamp(460px, calc(100vh - 210px), 900px);
  }
}

@media (max-width: 768px) {
  .map-side {
    display: flex;
  }

  .map-stage {
    height: 420px;
  }

  .display-toggles {
    gap: 10px;
    padding: 6px 9px;
  }
}
</style>
