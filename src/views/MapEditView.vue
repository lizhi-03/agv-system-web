<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AgvMapCanvas from '../components/AgvMapCanvas.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppSegmented from '../components/ui/AppSegmented.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import { listAgv } from '../api/agv'
import { getCurrentMap, resetMap, saveMap } from '../api/map'
import { confirmDialog } from '../composables/useConfirm'
import { usePolling } from '../composables/usePolling'
import { toast } from '../composables/useToast'
import type { AgvMap, AgvSnapshot, Obstacle, Station } from '../types'

interface DraftSnapshot {
  obstacles: Obstacle[]
  stations: Station[]
}

const draft = ref<AgvMap | null>(null)
const agvs = ref<AgvSnapshot[]>([])
const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)
const errorText = ref('')
const tool = ref('obstacle')
const history = ref<DraftSnapshot[]>([])
const dirty = ref(false)
const hoverCell = ref<{ x: number; y: number } | null>(null)

const TOOL_OPTIONS = [
  { value: 'obstacle', label: '障碍', icon: 'grid' },
  { value: 'station', label: '站点', icon: 'pin' },
  { value: 'charge', label: '充电站', icon: 'bolt' },
  { value: 'erase', label: '擦除', icon: 'trash' },
]

function cloneMap(map: AgvMap): AgvMap {
  return {
    ...map,
    obstacles: map.obstacles.map((item) => ({ ...item })),
    stations: map.stations.map((item) => ({ ...item })),
    paths: map.paths.map((item) => ({ ...item })),
  }
}

async function loadMap(): Promise<void> {
  loading.value = true
  try {
    const map = await getCurrentMap()
    draft.value = map ? cloneMap(map) : null
    history.value = []
    dirty.value = false
    errorText.value = map ? '' : '后端未返回当前地图'
  } catch (error) {
    draft.value = null
    errorText.value = error instanceof Error ? error.message : '地图加载失败'
  } finally {
    loading.value = false
  }
}

async function loadVehicles(): Promise<void> {
  try {
    agvs.value = await listAgv(true)
  } catch {
    /* 编辑器内的车辆位置为只读辅助信息，失败不打断编辑 */
  }
}

onMounted(() => {
  void loadMap()
})

usePolling(loadVehicles, { interval: 3000 })

const obstacleCount = computed(() => draft.value?.obstacles.length ?? 0)
const stationCount = computed(
  () => draft.value?.stations.filter((item) => item.type !== 'charge').length ?? 0,
)
const chargeCount = computed(
  () => draft.value?.stations.filter((item) => item.type === 'charge').length ?? 0,
)

function snapshot(): DraftSnapshot {
  const map = draft.value
  if (!map) return { obstacles: [], stations: [] }
  return {
    obstacles: map.obstacles.map((item) => ({ ...item })),
    stations: map.stations.map((item) => ({ ...item })),
  }
}

function pushHistory(): void {
  if (!draft.value) return
  history.value.push(snapshot())
  if (history.value.length > 30) history.value.shift()
}

function formatStationId(prefix: string): string {
  const used = new Set((draft.value?.stations ?? []).map((item) => item.id))
  let index = 1
  while (used.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

function onCell(cell: { x: number; y: number }): void {
  const map = draft.value
  if (!map) return
  pushHistory()

  if (tool.value === 'obstacle') {
    const index = map.obstacles.findIndex((item) => item.x === cell.x && item.y === cell.y)
    if (index >= 0) {
      map.obstacles.splice(index, 1)
    } else {
      map.obstacles.push({ x: cell.x, y: cell.y })
      map.stations = map.stations.filter((item) => !(item.x === cell.x && item.y === cell.y))
    }
  } else if (tool.value === 'erase') {
    map.obstacles = map.obstacles.filter((item) => !(item.x === cell.x && item.y === cell.y))
    map.stations = map.stations.filter((item) => !(item.x === cell.x && item.y === cell.y))
  } else {
    const type = tool.value === 'charge' ? 'charge' : 'station'
    const existing = map.stations.find((item) => item.x === cell.x && item.y === cell.y)
    if (existing && existing.type === type) {
      map.stations = map.stations.filter((item) => item !== existing)
    } else {
      map.stations = map.stations.filter((item) => !(item.x === cell.x && item.y === cell.y))
      map.stations.push({
        id: formatStationId(type === 'charge' ? 'C' : 'S'),
        x: cell.x,
        y: cell.y,
        type,
      })
      map.obstacles = map.obstacles.filter((item) => !(item.x === cell.x && item.y === cell.y))
    }
  }
  dirty.value = true
}

function onHover(cell: { x: number; y: number } | null): void {
  hoverCell.value = cell
}

function undo(): void {
  const previous = history.value.pop()
  const map = draft.value
  if (!previous || !map) return
  map.obstacles = previous.obstacles.map((item) => ({ ...item }))
  map.stations = previous.stations.map((item) => ({ ...item }))
  // 撤销回到初始快照（历史栈清空）即视为无未保存修改
  dirty.value = history.value.length > 0
}

async function onReset(): Promise<void> {
  if (dirty.value) {
    const confirmed = await confirmDialog({
      title: '重置地图',
      message: '将丢弃当前所有未保存的修改，并调用 POST /map/reset 重新读取当前地图。',
      confirmLabel: '丢弃并重置',
      danger: true,
    })
    if (!confirmed) return
  }
  if (resetting.value) return
  resetting.value = true
  try {
    await resetMap()
    await loadMap()
    toast.success('已重新读取当前地图', '未保存的修改已丢弃')
  } catch {
    /* http 层已提示 */
  } finally {
    resetting.value = false
  }
}

async function onSave(): Promise<void> {
  const map = draft.value
  if (!map || saving.value) return
  saving.value = true
  try {
    await saveMap(map)
    const current = await getCurrentMap()
    if (current) {
      draft.value = cloneMap(current)
      toast.success(`已保存为新版本 v${current.version ?? '—'}`)
    } else {
      toast.success('地图已保存')
    }
    history.value = []
    dirty.value = false
    errorText.value = ''
  } catch {
    /* http 层已提示 */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" :disabled="!history.length" @click="undo">
      <Icon name="undo" :size="14" />
      撤销
    </AppButton>
    <AppButton size="sm" variant="secondary" :loading="resetting" @click="onReset">
      <Icon name="refresh" :size="14" />
      重置
    </AppButton>
    <AppButton size="sm" variant="primary" :loading="saving" :disabled="!draft" @click="onSave">
      <Icon name="save" :size="14" />
      保存新版本
    </AppButton>
  </Teleport>

  <div class="page">
    <div class="editor-toolbar">
      <AppSegmented v-model="tool" :options="TOOL_OPTIONS" />
      <div v-if="draft" class="chips">
        <span class="chip num">尺寸 {{ draft.width }} × {{ draft.height }}</span>
        <span class="chip num">版本 v{{ draft.version ?? 1 }}</span>
        <span class="chip num">障碍 {{ obstacleCount }}</span>
        <span class="chip num">站点 {{ stationCount }}</span>
        <span class="chip num">充电站 {{ chargeCount }}</span>
        <span v-if="dirty" class="chip dirty">未保存修改</span>
      </div>
      <span class="toolbar-spacer" />
      <AppButton size="sm" variant="secondary" @click="loadMap">
        <Icon name="refresh" :size="13" />
        重新加载
      </AppButton>
    </div>

    <div v-if="loading" class="editor-skeleton">
      <SkeletonBlock height="520px" radius="20px" />
    </div>

    <AppCard v-else-if="!draft" padding="none">
      <EmptyState
        title="暂无可编辑的地图"
        :description="`${errorText}。请确认后端已配置当前地图（GET /map/current 返回 code=200 且含 width/height）。`"
      >
        <AppButton variant="primary" @click="loadMap">
          <Icon name="refresh" :size="14" />
          重新加载
        </AppButton>
      </EmptyState>
    </AppCard>

    <template v-else>
      <AppCard padding="none" class="editor-card">
        <div class="editor-stage">
          <AgvMapCanvas
            :map="draft"
            :agvs="agvs"
            interactive
            :show-paths="false"
            :show-grid="true"
            :show-labels="true"
            @cell="onCell"
            @hover="onHover"
          >
            <template #overlay>
              <span v-if="hoverCell" class="cell-chip num">
                格 ({{ hoverCell.x }}, {{ hoverCell.y }})
              </span>
            </template>
          </AgvMapCanvas>
        </div>
      </AppCard>

      <p class="editor-hint">
        <Icon name="info" :size="14" />
        点击格子以当前工具编辑：障碍点击切换、站点/充电站同格唯一（再次点击移除）、擦除同时清除障碍与站点。障碍与站点互斥；保存会调用
        POST /map/save 生成新版本，并重新读取当前地图。车辆位置为只读。
      </p>
    </template>
  </div>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.chip.dirty {
  background: var(--orange-tint);
  color: var(--orange-text);
  font-weight: 600;
}

.editor-skeleton {
  width: 100%;
}

.editor-card {
  overflow: hidden;
}

.editor-stage {
  height: clamp(480px, calc(100vh - 240px), 1000px);
  padding: 14px;
}

.cell-chip {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 5;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-glass);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card);
  font-size: 11.5px;
  color: var(--text-secondary);
  pointer-events: none;
}

.editor-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.editor-hint :deep(svg) {
  margin-top: 1px;
  flex: none;
  color: var(--accent);
}

@media (max-width: 768px) {
  .editor-toolbar {
    gap: 8px;
  }

  .editor-stage {
    height: 420px;
    padding: 8px;
  }
}
</style>
