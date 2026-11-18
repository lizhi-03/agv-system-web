<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AgvMapCanvas from '../components/AgvMapCanvas.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppModal from '../components/ui/AppModal.vue'
import AppNumberField from '../components/ui/AppNumberField.vue'
import AppSegmented from '../components/ui/AppSegmented.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/ui/Icon.vue'
import SkeletonBlock from '../components/ui/SkeletonBlock.vue'
import { getCurrentMap, resetMap, saveMap } from '../api/map'
import { confirmDialog } from '../composables/useConfirm'
import { useLiveState } from '../composables/useLiveState'
import { toast } from '../composables/useToast'
import type { AgvMap, Obstacle, Station } from '../types'

interface MapCanvasApi {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
}

interface EditorSnapshot {
  width: number
  height: number
  obstacles: Obstacle[]
  stations: Station[]
}

type Tool = 'obstacle' | 'station' | 'charge' | 'erase'

const draft = ref<AgvMap | null>(null)
// 只读车辆位置：复用实时通道（SSE 优先），不再单独 3s 轮询 /agv/list
const { agvs } = useLiveState({ withMap: false })
const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)
const errorText = ref('')
const tool = ref<Tool>('obstacle')
const brushSize = ref(1)
const history = ref<EditorSnapshot[]>([])
const redoStack = ref<EditorSnapshot[]>([])
const baselineKey = ref('')
const hoverCell = ref<{ x: number; y: number } | null>(null)
const zoomPercent = ref(100)
const mapRef = ref<MapCanvasApi | null>(null)
const summaryOpen = ref(false)
const strokePainted = new Set<string>()

const TOOL_OPTIONS = [
  { value: 'obstacle', label: '障碍', icon: 'grid', key: '1' },
  { value: 'station', label: '站点', icon: 'pin', key: '2' },
  { value: 'charge', label: '充电站', icon: 'bolt', key: '3' },
  { value: 'erase', label: '擦除', icon: 'trash', key: '4' },
]

const BRUSH_OPTIONS = [
  { value: '1', label: '1×1' },
  { value: '3', label: '3×3' },
]

function cloneList<T extends object>(list: T[]): T[] {
  return list.map((item) => ({ ...item }))
}

function cloneMap(map: AgvMap): AgvMap {
  return {
    ...map,
    obstacles: cloneList(map.obstacles),
    stations: cloneList(map.stations),
    paths: cloneList(map.paths),
  }
}

function snapshot(map: AgvMap | null): EditorSnapshot {
  if (!map) return { width: 0, height: 0, obstacles: [], stations: [] }
  return {
    width: map.width,
    height: map.height,
    obstacles: cloneList(map.obstacles),
    stations: cloneList(map.stations),
  }
}

function keyOf(snap: EditorSnapshot): string {
  return JSON.stringify(snap)
}

const dirty = computed(() => {
  if (!draft.value) return false
  return keyOf(snapshot(draft.value)) !== baselineKey.value
})

const obstacleCount = computed(() => draft.value?.obstacles.length ?? 0)
const stationCount = computed(
  () => draft.value?.stations.filter((item) => item.type !== 'charge').length ?? 0,
)
const chargeCount = computed(
  () => draft.value?.stations.filter((item) => item.type === 'charge').length ?? 0,
)

async function loadMap(): Promise<void> {
  loading.value = true
  try {
    const map = await getCurrentMap()
    applyLoadedMap(map)
    errorText.value = map ? '' : '后端未返回当前地图'
  } catch (error) {
    draft.value = null
    errorText.value = error instanceof Error ? error.message : '地图加载失败'
  } finally {
    loading.value = false
  }
}

function applyLoadedMap(map: AgvMap | null): void {
  draft.value = map ? cloneMap(map) : null
  history.value = []
  redoStack.value = []
  baselineKey.value = map ? keyOf(snapshot(map)) : ''
}

onMounted(() => {
  void loadMap()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

function pushHistory(): void {
  if (!draft.value) return
  history.value.push(snapshot(draft.value))
  if (history.value.length > 60) history.value.shift()
  redoStack.value = []
}

function restore(snap: EditorSnapshot): void {
  const map = draft.value
  if (!map) return
  map.width = snap.width
  map.height = snap.height
  map.obstacles = cloneList(snap.obstacles)
  map.stations = cloneList(snap.stations)
}

function undo(): void {
  const previous = history.value.pop()
  if (!previous || !draft.value) return
  redoStack.value.push(snapshot(draft.value))
  restore(previous)
}

function redo(): void {
  const next = redoStack.value.pop()
  if (!next || !draft.value) return
  history.value.push(snapshot(draft.value))
  restore(next)
}

function formatStationId(prefix: string): string {
  const used = new Set((draft.value?.stations ?? []).map((item) => item.id))
  let index = 1
  while (used.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

function brushCells(cell: { x: number; y: number }): { x: number; y: number }[] {
  const map = draft.value
  if (!map) return []
  const size = Math.max(1, brushSize.value)
  const offset = Math.floor(size / 2)
  const cells: { x: number; y: number }[] = []
  for (let dx = -offset; dx <= offset; dx += 1) {
    for (let dy = -offset; dy <= offset; dy += 1) {
      const x = cell.x + dx
      const y = cell.y + dy
      if (x >= 0 && y >= 0 && x < map.width && y < map.height) cells.push({ x, y })
    }
  }
  return cells
}

function addObstacle(cell: { x: number; y: number }): void {
  const map = draft.value
  if (!map) return
  if (!map.obstacles.some((item) => item.x === cell.x && item.y === cell.y)) {
    map.obstacles.push({ x: cell.x, y: cell.y })
  }
  map.stations = map.stations.filter((item) => !(item.x === cell.x && item.y === cell.y))
}

function eraseCell(cell: { x: number; y: number }): void {
  const map = draft.value
  if (!map) return
  map.obstacles = map.obstacles.filter((item) => !(item.x === cell.x && item.y === cell.y))
  map.stations = map.stations.filter((item) => !(item.x === cell.x && item.y === cell.y))
}

function placeStation(cell: { x: number; y: number }, type: 'station' | 'charge'): void {
  const map = draft.value
  if (!map) return
  const existing = map.stations.find((item) => item.x === cell.x && item.y === cell.y)
  if (existing && existing.type === type) {
    map.stations = map.stations.filter((item) => item !== existing)
    return
  }
  map.stations = map.stations.filter((item) => !(item.x === cell.x && item.y === cell.y))
  map.stations.push({
    id: formatStationId(type === 'charge' ? 'C' : 'S'),
    x: cell.x,
    y: cell.y,
    type,
  })
  map.obstacles = map.obstacles.filter((item) => !(item.x === cell.x && item.y === cell.y))
}

function onStrokeStart(): void {
  pushHistory()
  strokePainted.clear()
}

function onCell(cell: { x: number; y: number }): void {
  const map = draft.value
  if (!map) return
  const key = `${cell.x},${cell.y}`
  if (strokePainted.has(key)) return
  strokePainted.add(key)

  if (tool.value === 'obstacle') {
    for (const target of brushCells(cell)) addObstacle(target)
    return
  }
  if (tool.value === 'erase') {
    for (const target of brushCells(cell)) eraseCell(target)
    return
  }
  placeStation(cell, tool.value === 'charge' ? 'charge' : 'station')
}

function onStrokeEnd(): void {
  strokePainted.clear()
}

function applySize(): void {
  const map = draft.value
  if (!map) return
  const width = Math.round(map.width)
  const height = Math.round(map.height)
  const nextWidth = Math.min(200, Math.max(10, Number.isFinite(width) ? width : 10))
  const nextHeight = Math.min(200, Math.max(10, Number.isFinite(height) ? height : 10))
  if (nextWidth === map.width && nextHeight === map.height) return
  pushHistory()
  map.width = nextWidth
  map.height = nextHeight
  map.obstacles = map.obstacles.filter((item) => item.x < nextWidth && item.y < nextHeight)
  map.stations = map.stations.filter((item) => item.x < nextWidth && item.y < nextHeight)
}

const changeSummary = computed(() => {
  const map = draft.value
  if (!map) return null
  const base: EditorSnapshot = baselineKey.value
    ? JSON.parse(baselineKey.value)
    : { width: map.width, height: map.height, obstacles: [], stations: [] }
  const baseObstacles = new Set(base.obstacles.map((item) => `${item.x},${item.y}`))
  const currentObstacles = new Set(map.obstacles.map((item) => `${item.x},${item.y}`))
  const obstaclesAdded = [...currentObstacles].filter((key) => !baseObstacles.has(key)).length
  const obstaclesRemoved = [...baseObstacles].filter((key) => !currentObstacles.has(key)).length
  const baseStations = new Map(base.stations.map((item) => [item.id, `${item.x},${item.y},${item.type}`]))
  const currentStations = new Map(map.stations.map((item) => [item.id, `${item.x},${item.y},${item.type}`]))
  let stationsAdded = 0
  let stationsRemoved = 0
  let stationsMoved = 0
  for (const [id, value] of currentStations) {
    if (!baseStations.has(id)) stationsAdded += 1
    else if (baseStations.get(id) !== value) stationsMoved += 1
  }
  for (const id of baseStations.keys()) {
    if (!currentStations.has(id)) stationsRemoved += 1
  }
  return {
    obstaclesAdded,
    obstaclesRemoved,
    stationsAdded,
    stationsRemoved,
    stationsMoved,
    sizeChanged: base.width !== map.width || base.height !== map.height,
    baseWidth: base.width,
    baseHeight: base.height,
    width: map.width,
    height: map.height,
    version: map.version ?? 1,
  }
})

function openSaveSummary(): void {
  if (!draft.value) return
  summaryOpen.value = true
}

async function onSave(): Promise<void> {
  const map = draft.value
  if (!map || saving.value) return
  saving.value = true
  try {
    await saveMap(map)
    const current = await getCurrentMap()
    applyLoadedMap(current)
    summaryOpen.value = false
    toast.success(
      current ? `已保存为新版本 v${current.version ?? '—'}` : '地图已保存',
      '已重新读取当前地图并重置撤销历史',
    )
  } catch {
    /* http 层已提示 */
  } finally {
    saving.value = false
  }
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

function onKeydown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }
  const toolMap: Record<string, Tool> = { '1': 'obstacle', '2': 'station', '3': 'charge', '4': 'erase' }
  const next = toolMap[event.key]
  if (next) {
    event.preventDefault()
    tool.value = next
  }
}
</script>

<template>
  <Teleport to="#topbar-actions" defer>
    <AppButton size="sm" variant="secondary" :disabled="!history.length" @click="undo">
      <Icon name="undo" :size="14" />
      撤销
    </AppButton>
    <AppButton size="sm" variant="secondary" :disabled="!redoStack.length" @click="redo">
      <Icon name="redo" :size="14" />
      重做
    </AppButton>
    <AppButton size="sm" variant="secondary" :loading="resetting" @click="onReset">
      <Icon name="refresh" :size="14" />
      重置
    </AppButton>
    <AppButton size="sm" variant="primary" :loading="saving" :disabled="!draft" @click="openSaveSummary">
      <Icon name="save" :size="14" />
      保存新版本
    </AppButton>
  </Teleport>

  <div class="editor-shell">
    <div class="editor-stage">
      <div v-if="loading" class="editor-loading">
        <SkeletonBlock height="100%" radius="14px" />
      </div>
      <EmptyState
        v-else-if="!draft"
        class="editor-empty"
        title="暂无可编辑的地图"
        :description="`${errorText}。请确认后端已配置当前地图。`"
      >
        <AppButton variant="primary" @click="loadMap">
          <Icon name="refresh" :size="14" />
          重新加载
        </AppButton>
      </EmptyState>
      <template v-else>
        <AgvMapCanvas
          ref="mapRef"
          :map="draft"
          :agvs="agvs"
          interactive
          :brush-size="brushSize"
          :show-paths="false"
          :show-grid="true"
          :show-labels="true"
          @cell="onCell"
          @stroke-start="onStrokeStart"
          @stroke-end="onStrokeEnd"
          @hover="hoverCell = $event"
          @viewport-change="zoomPercent = $event.percent"
        />
        <div class="float toolbar-float glass">
          <AppButton size="sm" variant="secondary" :disabled="!history.length" @click="undo">
            <Icon name="undo" :size="14" />
          </AppButton>
          <AppButton size="sm" variant="secondary" :disabled="!redoStack.length" @click="redo">
            <Icon name="redo" :size="14" />
          </AppButton>
          <span class="toolbar-divider" />
          <span v-if="hoverCell" class="cell-chip num">
            格 ({{ hoverCell.x }}, {{ hoverCell.y }})
          </span>
          <span v-else class="cell-chip">拖拽连续绘制</span>
          <span class="dirty-chip" :data-dirty="dirty">
            {{ dirty ? '未保存修改' : '已保存' }}
          </span>
        </div>

        <div class="float zoom-float glass">
          <button type="button" class="zoom-btn" aria-label="缩小" @click="mapRef?.zoomOut()">
            <Icon name="minus" :size="15" />
          </button>
          <span class="num">{{ zoomPercent }}%</span>
          <button type="button" class="zoom-btn" aria-label="放大" @click="mapRef?.zoomIn()">
            <Icon name="plus" :size="15" />
          </button>
          <button type="button" class="zoom-btn" aria-label="适应窗口" @click="mapRef?.fit()">
            <Icon name="expand" :size="15" />
          </button>
        </div>

        <div class="float editor-hint glass">
          <Icon name="info" :size="13" />
          左键拖拽绘制 · 滚轮缩放 · 空格/右键拖拽平移 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做
        </div>
      </template>
    </div>

    <aside class="editor-side glass">
      <div class="panel-head">
        <h2>地图编辑</h2>
        <p v-if="draft">v{{ draft.version ?? 1 }} · {{ draft.width }} × {{ draft.height }}</p>
      </div>

      <section class="panel-section">
        <div class="section-title">工具 <span class="section-note">快捷键 1–4</span></div>
        <div class="tool-list">
          <button
            v-for="option in TOOL_OPTIONS"
            :key="option.value"
            type="button"
            class="tool-btn"
            :class="{ active: tool === option.value }"
            @click="tool = option.value as Tool"
          >
            <span class="tool-icon"><Icon :name="option.icon" :size="17" /></span>
            <span class="tool-name">{{ option.label }}</span>
            <span class="tool-key">{{ option.key }}</span>
          </button>
        </div>
        <div class="section-title">画笔</div>
        <AppSegmented
          :model-value="String(brushSize)"
          :options="BRUSH_OPTIONS"
          size="sm"
          block
          @update:model-value="brushSize = Number($event)"
        />
      </section>

      <section class="panel-section">
        <div class="section-title">地图尺寸 <span class="section-note">10–200</span></div>
        <div class="size-row">
          <label class="field">
            <span class="field-label">宽</span>
            <AppNumberField
              :model-value="draft?.width ?? 40"
              :min="10"
              :max="200"
              size="sm"
              aria-label="地图宽度"
              @update:model-value="((draft as AgvMap).width = $event)"
            />
          </label>
          <label class="field">
            <span class="field-label">高</span>
            <AppNumberField
              :model-value="draft?.height ?? 30"
              :min="10"
              :max="200"
              size="sm"
              aria-label="地图高度"
              @update:model-value="((draft as AgvMap).height = $event)"
            />
          </label>
          <AppButton size="sm" variant="secondary" :disabled="!draft" @click="applySize">
            应用
          </AppButton>
        </div>
        <p class="field-hint">修改尺寸会裁剪越界的障碍与站点，可撤销。</p>
      </section>

      <section class="panel-section stats">
        <div class="stat"><span class="stat-value num">{{ obstacleCount }}</span><span class="stat-label">障碍</span></div>
        <div class="stat"><span class="stat-value num">{{ stationCount }}</span><span class="stat-label">站点</span></div>
        <div class="stat"><span class="stat-value num">{{ chargeCount }}</span><span class="stat-label">充电站</span></div>
      </section>

      <section class="panel-section">
        <div class="section-title">变更摘要</div>
        <ul v-if="changeSummary" class="summary-list">
          <li><span>障碍</span><strong class="num">+{{ changeSummary.obstaclesAdded }} / -{{ changeSummary.obstaclesRemoved }}</strong></li>
          <li><span>站点新增/移除</span><strong class="num">+{{ changeSummary.stationsAdded }} / -{{ changeSummary.stationsRemoved }}</strong></li>
          <li v-if="changeSummary.stationsMoved"><span>站点移动</span><strong class="num">{{ changeSummary.stationsMoved }}</strong></li>
          <li v-if="changeSummary.sizeChanged">
            <span>尺寸</span>
            <strong class="num">{{ changeSummary.baseWidth }}×{{ changeSummary.baseHeight }} → {{ changeSummary.width }}×{{ changeSummary.height }}</strong>
          </li>
          <li><span>目标版本</span><strong class="num">v{{ changeSummary.version }} → v{{ changeSummary.version + 1 }}</strong></li>
        </ul>
        <div class="panel-actions">
          <AppButton size="md" variant="secondary" block :disabled="!draft" @click="openSaveSummary">
            <Icon name="save" :size="16" />
            保存前确认
          </AppButton>
        </div>
      </section>
    </aside>
  </div>

  <AppModal
    v-model="summaryOpen"
    title="保存为新版本"
    subtitle="保存会调用 POST /map/save 生成新版本，并重新读取当前地图"
    :width="460"
    :loading="saving"
    confirm-label="确认保存"
    @confirm="onSave"
  >
    <div v-if="changeSummary" class="save-summary">
      <div v-if="!dirty" class="summary-note">
        地图内容没有变化，仍会创建一个新版本（版本号 +1）。
      </div>
      <dl class="summary-detail">
        <div><dt>障碍变化</dt><dd class="num">+{{ changeSummary.obstaclesAdded }} / -{{ changeSummary.obstaclesRemoved }}</dd></div>
        <div><dt>站点变化</dt><dd class="num">+{{ changeSummary.stationsAdded }} / -{{ changeSummary.stationsRemoved }}<span v-if="changeSummary.stationsMoved">（移动 {{ changeSummary.stationsMoved }}）</span></dd></div>
        <div v-if="changeSummary.sizeChanged"><dt>尺寸</dt><dd class="num">{{ changeSummary.baseWidth }}×{{ changeSummary.baseHeight }} → {{ changeSummary.width }}×{{ changeSummary.height }}</dd></div>
        <div><dt>版本</dt><dd class="num">v{{ changeSummary.version }} → v{{ changeSummary.version + 1 }}</dd></div>
      </dl>
      <p class="field-hint">保存后撤销/重做历史会重置，并提示新版本号。</p>
    </div>
  </AppModal>
</template>

<style scoped>
.editor-shell {
  display: flex;
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: hidden;
}

.editor-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.editor-stage :deep(.map-canvas) {
  border-radius: 0;
  min-height: 0;
}

.editor-loading,
.editor-empty {
  position: absolute;
  inset: 16px;
  z-index: 2;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
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

.toolbar-float {
  top: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--separator);
  margin: 0 2px;
}

.cell-chip {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.dirty-chip {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 10.5px;
  font-weight: 600;
  background: var(--green-tint);
  color: var(--green-text);
  white-space: nowrap;
}

.dirty-chip[data-dirty='true'] {
  background: var(--orange-tint);
  color: var(--orange-text);
}

.zoom-float {
  top: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
}

.zoom-float span {
  min-width: 44px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
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

.editor-hint {
  left: 14px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.editor-side {
  width: 288px;
  flex: none;
  height: 100%;
  overflow-y: auto;
  border-radius: 0;
  border-left: 1px solid var(--separator);
  border-top: none;
  border-right: none;
  border-bottom: none;
  box-shadow: none;
  padding: 18px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-head h2 {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.panel-head p {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--separator);
}

.panel-section:last-of-type {
  border-bottom: none;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

.section-note {
  font-weight: 400;
  font-size: 10.5px;
  color: var(--text-tertiary);
}

.tool-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border-radius: 10px;
  background: var(--surface-subtle);
  border: 1.5px solid transparent;
  font-size: 12px;
  color: var(--text-secondary);
  transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
}

.tool-btn.active {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: 600;
}

.tool-icon {
  display: inline-flex;
  flex: none;
}

.tool-name {
  flex: 1;
  text-align: left;
  white-space: nowrap;
}

.tool-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 5px;
  background: var(--separator);
  font-size: 10px;
  color: var(--text-secondary);
}

.size-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.size-row .field {
  flex: 1;
}

.stats {
  flex-direction: row;
  justify-content: space-between;
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  flex: 1;
  padding: 8px 4px;
  border-radius: 10px;
  background: var(--surface-subtle);
}

.stat-value {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 10.5px;
  color: var(--text-tertiary);
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11.5px;
}

.summary-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
}

.summary-list strong {
  color: var(--text);
  font-weight: 600;
}

.panel-actions {
  display: flex;
  gap: 8px;
  padding-top: 2px;
}

.save-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-note {
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--orange-tint);
  color: var(--orange-text);
  font-size: 12px;
}

.summary-detail {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
}

.summary-detail > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--separator);
  font-size: 12.5px;
}

.summary-detail > div:last-child {
  border-bottom: none;
}

.summary-detail dt {
  color: var(--text-tertiary);
}

.summary-detail dd {
  margin: 0;
  color: var(--text);
  text-align: right;
}

@media (max-width: 1100px) {
  .editor-side {
    width: 260px;
    padding: 14px 12px 18px;
  }
}

@media (max-width: 900px) {
  .editor-shell {
    flex-direction: column;
    height: auto;
  }

  .editor-stage {
    height: 62vh;
    min-height: 400px;
  }

  .editor-side {
    width: 100%;
    height: auto;
    border-left: none;
    border-top: 1px solid var(--separator);
  }
}
</style>
