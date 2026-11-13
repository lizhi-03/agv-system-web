<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AgvMapCanvas from '../components/AgvMapCanvas.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import BatteryBar from '../components/ui/BatteryBar.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import StatCard from '../components/ui/StatCard.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import { listAgv } from '../api/agv'
import { pageLogs } from '../api/log'
import { getCurrentMap } from '../api/map'
import { pageTasks } from '../api/task'
import { useBackendStatus } from '../composables/useBackendStatus'
import { usePolling } from '../composables/usePolling'
import type { AgvLog, AgvMap, AgvSnapshot, AgvTask } from '../types'
import { agvColor } from '../utils/colors'
import {
  batteryTone,
  formatClock,
  formatLatency,
  formatShortTime,
  taskStatusMeta,
  type Tone,
} from '../utils/labels'

const router = useRouter()
const { status } = useBackendStatus()

const mapData = ref<AgvMap | null>(null)
const agvs = ref<AgvSnapshot[]>([])
const taskTotal = ref(0)
const taskRecords = ref<AgvTask[]>([])
const logs = ref<AgvLog[]>([])
const coreError = ref('')
const taskError = ref('')
const logError = ref('')
const booting = ref(true)
const tasksLoaded = ref(false)
const logsLoaded = ref(false)
const lastUpdated = ref<number | null>(null)

async function loadCore(): Promise<void> {
  try {
    const [map, cars] = await Promise.all([getCurrentMap(true), listAgv(true)])
    mapData.value = map
    agvs.value = cars
    coreError.value = ''
    lastUpdated.value = Date.now()
  } catch (error) {
    coreError.value = error instanceof Error ? error.message : '地图与车辆加载失败'
    throw error
  } finally {
    booting.value = false
  }
}

async function loadTasks(): Promise<void> {
  try {
    const page = await pageTasks({ page: 1, pageSize: 100 }, true)
    taskTotal.value = page.total
    taskRecords.value = page.records
    taskError.value = ''
  } catch (error) {
    taskError.value = error instanceof Error ? error.message : '任务统计加载失败'
  } finally {
    tasksLoaded.value = true
  }
}

async function loadLogs(): Promise<void> {
  try {
    const page = await pageLogs({ page: 1, pageSize: 6 }, true)
    logs.value = page.records
    logError.value = ''
  } catch (error) {
    logError.value = error instanceof Error ? error.message : '日志加载失败'
  } finally {
    logsLoaded.value = true
  }
}

const corePoller = usePolling(loadCore, { interval: 1000 })
const taskPoller = usePolling(loadTasks, { interval: 5000 })
const logPoller = usePolling(loadLogs, { interval: 5000 })

const { refresh: refreshCore, inFlight: coreInFlight } = corePoller
const { refresh: refreshTasks } = taskPoller
const { refresh: refreshLogs } = logPoller

function refreshAll(): void {
  void refreshCore()
  void refreshTasks()
  void refreshLogs()
}

const stats = computed(() => {
  const list = agvs.value
  const running = list.filter((car) => car.status === 'running').length
  const charging = list.filter((car) => car.status === 'charging').length
  const errors = list.filter((car) => car.status === 'error').length
  const batterySum = list.reduce(
    (sum, car) => sum + (Number.isFinite(car.battery) ? car.battery : 0),
    0,
  )
  return {
    total: list.length,
    running,
    charging,
    errors,
    avgBattery: list.length ? Math.round(batterySum / list.length) : 0,
  }
})

const avgBatteryTone = computed<Tone>(() =>
  stats.value.total ? batteryTone(stats.value.avgBattery) : 'gray',
)

const topAgvs = computed(() =>
  [...agvs.value].sort((a, b) => a.agvCode.localeCompare(b.agvCode)).slice(0, 6),
)

const mapMeta = computed(() => {
  const map = mapData.value
  if (!map) return null
  return {
    name: map.mapName || map.mapCode || '未命名地图',
    code: map.mapCode ?? '',
    version: map.version ?? 1,
    size: `${map.width} × ${map.height}`,
    stations: map.stations.length,
    charge: map.stations.filter((station) => station.type === 'charge').length,
    obstacles: map.obstacles.length,
    updatedAt: map.updatedAt,
  }
})

const mapSubtitle = computed(() => {
  const meta = mapMeta.value
  if (!meta) return '暂未获取到当前地图'
  return `${meta.name} · ${meta.size} 格 · 版本 v${meta.version}`
})

const taskDistribution = computed(() => {
  const order = ['processing', 'waiting', 'paused', 'completed', 'failed', 'cancelled']
  const sample = taskRecords.value.length
  const counts = new Map<string, number>()
  for (const task of taskRecords.value) {
    const key = task.status ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const rows = order
    .map((key) => {
      const count = counts.get(key) ?? 0
      const meta = taskStatusMeta(key)
      return { key, label: meta.text, tone: meta.tone, count, percent: sample ? Math.round((count / sample) * 100) : 0 }
    })
    .filter((row) => row.count > 0)
  const max = rows.reduce((value, row) => Math.max(value, row.count), 1)
  return rows.map((row) => ({ ...row, width: Math.round((row.count / max) * 100) }))
})

const errorState = computed(
  () => Boolean(coreError.value) && !mapData.value && agvs.value.length === 0,
)

const errorDescription = computed(() => {
  const message = coreError.value || '地图与车辆加载失败'
  const suffix = message.includes('无法连接后端')
    ? '轮询已自动降频，不会刷屏报错；启动后端服务后点击重试即可。'
    : '请确认后端服务已启动后重试。'
  return `${message}。${suffix}`
})
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <span v-if="lastUpdated" class="sync-hint num">更新于 {{ formatClock(lastUpdated) }}</span>
    <AppButton size="sm" variant="secondary" @click="router.push('/map')">
      <Icon name="map" :size="14" />
      实时地图
    </AppButton>
    <AppButton size="sm" variant="primary" :loading="coreInFlight" @click="refreshAll">
      <Icon name="refresh" :size="14" />
      刷新
    </AppButton>
  </Teleport>

  <div class="page">
    <div v-if="booting" class="dash-skeleton">
      <div class="dash-kpis">
        <SkeletonBlock v-for="index in 6" :key="index" height="112px" radius="20px" />
      </div>
      <div class="dash-grid">
        <div class="dash-main">
          <SkeletonBlock height="376px" radius="20px" />
          <SkeletonBlock height="280px" radius="20px" />
        </div>
        <div class="dash-side">
          <SkeletonBlock height="290px" radius="20px" />
          <SkeletonBlock height="290px" radius="20px" />
        </div>
      </div>
    </div>

    <AppCard v-else-if="errorState">
      <EmptyState
        title="无法连接后端服务"
        :description="errorDescription"
      >
        <AppButton variant="primary" @click="refreshAll">
          <Icon name="refresh" :size="15" />
          重试连接
        </AppButton>
      </EmptyState>
    </AppCard>

    <template v-else>
      <div class="dash-kpis">
        <StatCard
          label="车辆总数"
          :value="stats.total"
          unit="辆"
          icon="agv"
          tone="blue"
          hint="来自 POST /agv/list"
        />
        <StatCard
          label="运行中"
          :value="stats.running"
          unit="辆"
          icon="play"
          tone="green"
          :hint="stats.total ? `占比 ${Math.round((stats.running / stats.total) * 100)}%` : '暂无车辆'"
        />
        <StatCard
          label="充电中"
          :value="stats.charging"
          unit="辆"
          icon="bolt"
          tone="purple"
          hint="充电站停靠车辆"
        />
        <StatCard
          label="平均电量"
          :value="stats.avgBattery"
          unit="%"
          icon="battery"
          :tone="avgBatteryTone"
          :hint="stats.total ? `共 ${stats.total} 辆车电量均值` : '暂无车辆'"
        />
        <StatCard
          label="任务总数"
          :value="taskTotal"
          unit="条"
          icon="task"
          tone="teal"
          hint="服务端分页 total"
        />
        <StatCard
          label="异常车辆"
          :value="stats.errors"
          unit="辆"
          icon="alert"
          :tone="stats.errors > 0 ? 'red' : 'gray'"
          :hint="stats.errors > 0 ? '需要人工检查' : '全部正常'"
        />
      </div>

      <div class="dash-grid">
        <div class="dash-main">
          <AppCard title="实时地图" :subtitle="mapSubtitle" padding="none">
            <template #actions>
              <AppButton size="sm" variant="ghost" @click="router.push('/map')">
                全屏查看
                <Icon name="arrow-right" :size="13" />
              </AppButton>
            </template>
            <div class="mini-map">
              <AgvMapCanvas
                :map="mapData"
                :agvs="agvs"
                empty-text="暂未获取到当前地图"
                @select-agv="router.push('/map')"
              />
            </div>
          </AppCard>

          <AppCard title="车辆状态" :subtitle="`共 ${agvs.length} 辆车，显示前 ${topAgvs.length} 条`">
            <template #actions>
              <AppButton v-if="agvs.length > 6" size="sm" variant="ghost" @click="router.push('/agv')">
                查看全部
                <Icon name="arrow-right" :size="13" />
              </AppButton>
            </template>
            <ul v-if="topAgvs.length" class="car-list">
              <li v-for="car in topAgvs" :key="car.agvCode" class="car-row">
                <span class="car-code">
                  <i class="car-dot" :style="{ background: agvColor(car.agvCode) }" />
                  <span>{{ car.agvCode }}</span>
                </span>
                <StatusPill :status="car.status" kind="agv" />
                <BatteryBar :value="car.battery" />
                <span class="car-pos num">({{ car.x }}, {{ car.y }})</span>
              </li>
            </ul>
            <EmptyState
              v-else
              compact
              title="暂无车辆"
              description="前往车队页可批量加车，车辆编号将按 AGVplus0001 递增生成。"
            >
              <AppButton size="sm" variant="primary" @click="router.push('/agv')">前往车队</AppButton>
            </EmptyState>
          </AppCard>
        </div>

        <div class="dash-side">
          <AppCard title="任务状态分布" :subtitle="`基于最近 ${taskRecords.length} 条任务统计`">
            <template #actions>
              <AppButton size="sm" variant="ghost" @click="router.push('/task')">
                任务列表
                <Icon name="arrow-right" :size="13" />
              </AppButton>
            </template>
            <div v-if="!tasksLoaded" class="dist-skeleton">
              <SkeletonBlock v-for="index in 4" :key="index" height="22px" />
            </div>
            <template v-else-if="taskDistribution.length">
              <ul class="dist-list">
                <li v-for="row in taskDistribution" :key="row.key" class="dist-row">
                  <span class="dist-label">{{ row.label }}</span>
                  <span class="dist-bar">
                    <span
                      class="dist-fill"
                      :data-tone="row.tone"
                      :style="{ width: `${row.width}%` }"
                    />
                  </span>
                  <span class="dist-count num">{{ row.count }}</span>
                </li>
              </ul>
              <p class="dist-note">
                共 {{ taskTotal }} 条任务，分布基于 /task/page 首页 100 条样本
              </p>
            </template>
            <p v-else-if="taskError" class="error-note">{{ taskError }}</p>
            <EmptyState v-else compact title="暂无任务数据" description="在任务页创建运输任务后会显示状态分布。" />
          </AppCard>

          <AppCard title="最近系统日志" subtitle="来自 POST /log/page 最新 6 条">
            <template #actions>
              <AppButton size="sm" variant="ghost" @click="router.push('/log')">
                全部日志
                <Icon name="arrow-right" :size="13" />
              </AppButton>
            </template>
            <div v-if="!logsLoaded" class="dist-skeleton">
              <SkeletonBlock v-for="index in 5" :key="index" height="20px" />
            </div>
            <ul v-else-if="logs.length" class="log-list">
              <li v-for="item in logs" :key="item.logId" class="log-row">
                <span class="log-time num">{{ formatShortTime(item.timestamp) }}</span>
                <StatusPill :status="item.level" kind="log" :dot="false" />
                <span class="log-msg">{{ item.message || '—' }}</span>
              </li>
            </ul>
            <p v-else-if="logError" class="error-note">{{ logError }}</p>
            <EmptyState v-else compact title="暂无日志" description="服务运行后产生的日志会显示在这里。" />
          </AppCard>
        </div>
      </div>

      <AppCard title="地图与后端状态" padding="sm">
        <div class="map-strip">
          <div class="map-strip-item">
            <span class="map-strip-label">当前地图</span>
            <span class="map-strip-value">{{ mapMeta?.name || '—' }}</span>
          </div>
          <div class="map-strip-item">
            <span class="map-strip-label">版本</span>
            <span class="map-strip-value num">v{{ mapMeta?.version ?? '—' }}</span>
          </div>
          <div class="map-strip-item">
            <span class="map-strip-label">尺寸</span>
            <span class="map-strip-value num">{{ mapMeta?.size || '—' }}</span>
          </div>
          <div class="map-strip-item">
            <span class="map-strip-label">站点 / 充电站</span>
            <span class="map-strip-value num">{{ mapMeta?.stations ?? 0 }} / {{ mapMeta?.charge ?? 0 }}</span>
          </div>
          <div class="map-strip-item">
            <span class="map-strip-label">障碍</span>
            <span class="map-strip-value num">{{ mapMeta?.obstacles ?? 0 }}</span>
          </div>
          <div class="map-strip-item">
            <span class="map-strip-label">地图更新时间</span>
            <span class="map-strip-value num">{{ formatShortTime(mapMeta?.updatedAt) }}</span>
          </div>
          <div class="map-strip-spacer" />
          <div class="map-strip-item">
            <span class="map-strip-label">后端服务</span>
            <span class="map-strip-value service-state" :data-state="status.reachable ? 'online' : 'offline'">
              <i class="service-dot" />
              {{ status.reachable ? '已连接' : '未连接' }} ·
              <span class="num">{{ formatLatency(status.latency) }}</span>
            </span>
          </div>
        </div>
      </AppCard>

      <p v-if="coreError && (mapData || agvs.length)" class="inline-warning">
        <Icon name="alert" :size="14" />
        {{ coreError }}（显示的是最近一次成功的数据，可点击刷新重试）
      </p>
    </template>
  </div>
</template>

<style scoped>
.sync-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.dash-skeleton {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dash-kpis {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
}

.dash-main,
.dash-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.mini-map {
  height: 300px;
  padding: 0 14px 14px;
}

.car-list {
  display: flex;
  flex-direction: column;
}

.car-row {
  display: grid;
  grid-template-columns: minmax(110px, 1.2fr) auto minmax(106px, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 13px;
}

.car-row:last-child {
  border-bottom: none;
}

.car-code {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-weight: 600;
  font-size: 12.5px;
}

.car-code span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.car-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.car-pos {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: right;
  white-space: nowrap;
}

.dist-list {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.dist-row {
  display: grid;
  grid-template-columns: 56px 1fr 34px;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.dist-label {
  color: var(--text-secondary);
  white-space: nowrap;
}

.dist-bar {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  overflow: hidden;
}

.dist-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent);
  transition: width 0.4s var(--ease);
}

.dist-fill[data-tone='green'] {
  background: var(--green);
}

.dist-fill[data-tone='orange'] {
  background: var(--orange);
}

.dist-fill[data-tone='red'] {
  background: var(--red);
}

.dist-fill[data-tone='purple'] {
  background: var(--purple);
}

.dist-fill[data-tone='gray'] {
  background: var(--gray);
}

.dist-fill[data-tone='teal'] {
  background: var(--teal);
}

.dist-count {
  text-align: right;
  font-weight: 600;
  color: var(--text);
}

.dist-note {
  margin-top: 14px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.dist-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-row {
  display: grid;
  grid-template-columns: 66px auto 1fr;
  gap: 9px;
  align-items: start;
  padding: 9px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 12px;
}

.log-row:last-child {
  border-bottom: none;
}

.log-time {
  color: var(--text-tertiary);
  white-space: nowrap;
  padding-top: 3px;
}

.log-msg {
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.map-strip {
  display: flex;
  align-items: flex-end;
  gap: 28px;
  flex-wrap: wrap;
}

.map-strip-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.map-strip-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.map-strip-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
}

.map-strip-spacer {
  flex: 1;
}

.service-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.service-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--red);
}

.service-state[data-state='online'] .service-dot {
  background: var(--green);
}

.inline-warning {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--orange-text);
}

@media (max-width: 1280px) {
  .dash-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dash-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .dash-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .dash-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dash-side {
    display: flex;
  }

  .mini-map {
    height: 240px;
  }
}
</style>
