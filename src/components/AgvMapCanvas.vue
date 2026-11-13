<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { AgvMap, AgvSnapshot, Station } from '../types'
import { agvStatusMeta, toNumber } from '../utils/labels'
import { agvColor, withAlpha } from '../utils/colors'
import { useTheme } from '../composables/useTheme'

const props = withDefaults(
  defineProps<{
    map: AgvMap | null
    agvs?: AgvSnapshot[]
    selectedCode?: string | null
    /** 可点击编辑：点击空白/任意格都 emit cell（编辑页使用） */
    interactive?: boolean
    showGrid?: boolean
    showPaths?: boolean
    showLabels?: boolean
    showVehicles?: boolean
    emptyText?: string
    minCell?: number
  }>(),
  {
    agvs: () => [],
    selectedCode: null,
    interactive: false,
    showGrid: true,
    showPaths: true,
    showLabels: true,
    showVehicles: true,
    emptyText: '暂无地图数据',
    minCell: 6,
  },
)

const emit = defineEmits<{
  cell: [payload: { x: number; y: number }]
  'select-agv': [agvCode: string]
  hover: [payload: { x: number; y: number } | null]
}>()

interface TooltipLine {
  label: string
  value: string
}

const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const { resolved } = useTheme()

const tip = reactive({
  visible: false,
  left: 0,
  top: 0,
  title: '',
  badge: '',
  color: '#0a84ff',
  lines: [] as TooltipLine[],
})

let metrics = { originX: 0, originY: 0, cell: 0, width: 0, height: 0 }
let observer: ResizeObserver | null = null
let frame = 0

const TAU = Math.PI * 2

const positions = new Map<string, { x: number; y: number }>()
const headings = new Map<string, number>()

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function cellTopLeft(x: number, y: number): { px: number; py: number } {
  const map = props.map
  const height = map?.height ?? 0
  return {
    px: metrics.originX + x * metrics.cell,
    py: metrics.originY + (height - 1 - y) * metrics.cell,
  }
}

function cellCenter(x: number, y: number): { cx: number; cy: number } {
  const { px, py } = cellTopLeft(x, y)
  return { cx: px + metrics.cell / 2, cy: py + metrics.cell / 2 }
}

function insideBoard(x: number, y: number): boolean {
  const map = props.map
  if (!map) return false
  return x >= 0 && y >= 0 && x < map.width && y < map.height
}

function toCell(px: number, py: number): { x: number; y: number } | null {
  const map = props.map
  if (!map || metrics.cell <= 0) return null
  const gx = Math.floor((px - metrics.originX) / metrics.cell)
  const row = Math.floor((py - metrics.originY) / metrics.cell)
  if (gx < 0 || row < 0 || gx >= map.width || row >= map.height) return null
  return { x: gx, y: map.height - 1 - row }
}

function headingFor(agv: AgvSnapshot): number {
  const previous = positions.get(agv.agvCode)
  if (previous && (previous.x !== agv.x || previous.y !== agv.y)) {
    const dx = agv.x - previous.x
    const dy = agv.y - previous.y
    if (dx !== 0 || dy !== 0) {
      // 画布 x 向右、y 向下（世界 y 向上翻转），由实际位移推导朝向最可靠
      headings.set(agv.agvCode, Math.atan2(-dy, dx))
    }
  }
  positions.set(agv.agvCode, { x: agv.x, y: agv.y })
  const moved = headings.get(agv.agvCode)
  if (moved != null) return moved
  return (-toNumber(agv.direction) * Math.PI) / 180
}

function drawBolt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  const s = radius * 0.95
  ctx.beginPath()
  ctx.moveTo(cx + s * 0.18, cy - s)
  ctx.lineTo(cx - s * 0.5, cy + s * 0.14)
  ctx.lineTo(cx - s * 0.04, cy + s * 0.14)
  ctx.lineTo(cx - s * 0.18, cy + s)
  ctx.lineTo(cx + s * 0.5, cy - s * 0.14)
  ctx.lineTo(cx + s * 0.02, cy - s * 0.14)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
}

function drawTagLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  cell: number,
): void {
  const fontFamily = cssVar('--font-sans')
  const fontSize = Math.max(9, Math.min(11, Math.round(cell * 0.36)))
  ctx.font = `600 ${fontSize}px ${fontFamily}`
  const textWidth = ctx.measureText(text).width
  const paddingX = 5
  const boxWidth = textWidth + paddingX * 2
  const boxHeight = fontSize + 6
  const boxX = cx - boxWidth / 2
  const boxY = cy - boxHeight / 2
  roundRect(ctx, boxX, boxY, boxWidth, boxHeight, boxHeight / 2)
  ctx.fillStyle = cssVar('--map-label-bg')
  ctx.fill()
  ctx.fillStyle = cssVar('--map-label')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy + 0.5)
}

function draw(): void {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const width = wrap.clientWidth
  const height = wrap.clientHeight
  if (width <= 0 || height <= 0) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const map = props.map
  if (!map || map.width <= 0 || map.height <= 0) {
    metrics = { originX: 0, originY: 0, cell: 0, width, height }
    return
  }

  const pad = Math.max(14, Math.min(32, Math.round(Math.min(width, height) * 0.04)))
  const cell = Math.max(
    props.minCell,
    Math.floor(
      Math.min((width - pad * 2) / map.width, (height - pad * 2) / map.height),
    ),
  )
  const boardWidth = cell * map.width
  const boardHeight = cell * map.height
  const originX = Math.round((width - boardWidth) / 2)
  const originY = Math.round((height - boardHeight) / 2)
  metrics = { originX, originY, cell, width, height }

  // 地图底板
  roundRect(ctx, originX, originY, boardWidth, boardHeight, Math.min(16, cell * 0.6))
  ctx.fillStyle = cssVar('--map-bg')
  ctx.fill()
  ctx.strokeStyle = cssVar('--separator')
  ctx.lineWidth = 1
  ctx.stroke()

  // 网格
  if (props.showGrid && cell >= 5) {
    ctx.strokeStyle = cssVar('--map-grid')
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 1; x < map.width; x += 1) {
      const px = originX + x * cell + 0.5
      ctx.moveTo(px, originY)
      ctx.lineTo(px, originY + boardHeight)
    }
    for (let y = 1; y < map.height; y += 1) {
      const py = originY + y * cell + 0.5
      ctx.moveTo(originX, py)
      ctx.lineTo(originX + boardWidth, py)
    }
    ctx.stroke()
  }

  // 已占用路径（后端 paths）：淡色方块
  for (const point of map.paths ?? []) {
    if (!insideBoard(point.x, point.y)) continue
    const { px, py } = cellTopLeft(point.x, point.y)
    roundRect(
      ctx,
      px + cell * 0.16,
      py + cell * 0.16,
      cell * 0.68,
      cell * 0.68,
      Math.max(1.5, cell * 0.12),
    )
    ctx.fillStyle = cssVar('--map-occupied')
    ctx.fill()
  }

  // 规划路径（每车同色半透明折线，圆角连接）
  if (props.showPaths) {
    for (const agv of props.agvs) {
      const path = agv.plannedPath
      if (!path || path.length < 2) continue
      const color = agvColor(agv.agvCode)
      const selected = props.selectedCode === agv.agvCode
      ctx.beginPath()
      path.forEach((node, index) => {
        const { cx, cy } = cellCenter(node.x, node.y)
        if (index === 0) ctx.moveTo(cx, cy)
        else ctx.lineTo(cx, cy)
      })
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = withAlpha(color, selected ? 0.5 : 0.24)
      ctx.lineWidth = Math.max(2.5, cell * (selected ? 0.2 : 0.16))
      ctx.stroke()
      ctx.strokeStyle = withAlpha(color, selected ? 0.95 : 0.6)
      ctx.lineWidth = Math.max(1, cell * 0.06)
      ctx.stroke()
    }
  }

  // 障碍
  for (const obstacle of map.obstacles ?? []) {
    if (!insideBoard(obstacle.x, obstacle.y)) continue
    const { px, py } = cellTopLeft(obstacle.x, obstacle.y)
    roundRect(
      ctx,
      px + cell * 0.07,
      py + cell * 0.07,
      cell * 0.86,
      cell * 0.86,
      Math.max(2, cell * 0.18),
    )
    ctx.fillStyle = cssVar('--map-obstacle')
    ctx.fill()
  }

  // 站点 / 充电站
  for (const station of map.stations ?? []) {
    if (!insideBoard(station.x, station.y)) continue
    const charge = station.type === 'charge'
    const { cx, cy } = cellCenter(station.x, station.y)
    const radius = Math.max(3, cell * 0.26)
    ctx.beginPath()
    ctx.arc(cx, cy, radius + Math.max(1.2, cell * 0.07), 0, TAU)
    ctx.fillStyle = cssVar('--map-bg')
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, TAU)
    ctx.fillStyle = charge ? cssVar('--map-charge') : cssVar('--map-station')
    ctx.fill()
    if (charge && radius >= 4) drawBolt(ctx, cx, cy, radius * 0.8)
    if (props.showLabels && cell >= 12) {
      drawTagLabel(ctx, station.id, cx, cy - Math.max(7, cell * 0.36), cell)
    }
  }

  // 车辆（同格多车轻微错位，避免完全重叠）
  if (props.showVehicles) {
    const groups = new Map<string, AgvSnapshot[]>()
    for (const agv of props.agvs) {
      if (!insideBoard(agv.x, agv.y)) continue
      const key = `${agv.x},${agv.y}`
      const list = groups.get(key)
      if (list) list.push(agv)
      else groups.set(key, [agv])
    }
    for (const list of groups.values()) {
      list.forEach((agv, index) => {
        const color = agvColor(agv.agvCode)
        const { px, py } = cellTopLeft(agv.x, agv.y)
        const offsetX = list.length > 1 ? (index - (list.length - 1) / 2) * cell * 0.32 : 0
        const cx = px + cell / 2 + offsetX
        const cy = py + cell / 2
        const selected = props.selectedCode === agv.agvCode
      const bodyLength = Math.max(8, cell * 0.72)
      const bodyWidth = Math.max(6, cell * 0.44)
      const angle = headingFor(agv)

      if (selected) {
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(8, cell * 0.52), 0, TAU)
        ctx.fillStyle = withAlpha(color, 0.16)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
      ctx.shadowBlur = 5
      ctx.shadowOffsetY = 1.5
      roundRect(ctx, -bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, bodyWidth * 0.4)
      ctx.fillStyle = color
      ctx.fill()
      ctx.shadowColor = 'transparent'
      // 方向指示（车头白色三角）
      ctx.beginPath()
      ctx.moveTo(bodyLength / 2 - 1, 0)
      ctx.lineTo(bodyLength / 2 - Math.max(3, bodyLength * 0.26), -bodyWidth * 0.3)
      ctx.lineTo(bodyLength / 2 - Math.max(3, bodyLength * 0.26), bodyWidth * 0.3)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.fill()
      ctx.restore()

        if (props.showLabels && cell >= 13) {
          drawTagLabel(ctx, agv.agvCode, cx, py - Math.max(2, cell * 0.1), cell)
        }
      })
    }
  }
}

function scheduleDraw(): void {
  if (frame) window.cancelAnimationFrame(frame)
  frame = window.requestAnimationFrame(() => {
    frame = 0
    draw()
  })
}

function agvAt(cell: { x: number; y: number }): AgvSnapshot | undefined {
  return props.agvs.find((agv) => agv.x === cell.x && agv.y === cell.y)
}

function stationAt(cell: { x: number; y: number }): Station | undefined {
  return (props.map?.stations ?? []).find(
    (station) => station.x === cell.x && station.y === cell.y,
  )
}

function hideTip(): void {
  tip.visible = false
}

function positionTip(offsetX: number, offsetY: number, wrap: HTMLElement): void {
  const estimatedWidth = 228
  const estimatedHeight = 132
  let left = offsetX + 16
  let top = offsetY + 16
  if (left + estimatedWidth > wrap.clientWidth - 8) left = offsetX - estimatedWidth - 12
  if (top + estimatedHeight > wrap.clientHeight - 8) top = offsetY - estimatedHeight - 12
  tip.left = Math.max(8, left)
  tip.top = Math.max(8, top)
}

function showAgvTip(agv: AgvSnapshot, offsetX: number, offsetY: number, wrap: HTMLElement): void {
  const status = agvStatusMeta(agv.status)
  tip.title = agv.agvCode
  tip.badge = status.text
  tip.color = agvColor(agv.agvCode)
  tip.lines = [
    { label: '电量', value: `${Math.round(agv.battery)}%` },
    { label: '速度', value: `${Math.round(agv.speed)} cm/s` },
    { label: '坐标', value: `(${agv.x}, ${agv.y})` },
    { label: '任务', value: agv.taskId == null ? '无' : `#${agv.taskId}` },
  ]
  positionTip(offsetX, offsetY, wrap)
  tip.visible = true
}

function showStationTip(
  station: Station,
  offsetX: number,
  offsetY: number,
  wrap: HTMLElement,
): void {
  tip.title = station.id
  tip.badge = station.type === 'charge' ? '充电站' : '站点'
  tip.color = station.type === 'charge' ? '#ff9f0a' : '#0071e3'
  tip.lines = [{ label: '坐标', value: `(${station.x}, ${station.y})` }]
  positionTip(offsetX, offsetY, wrap)
  tip.visible = true
}

function updateHover(event: MouseEvent): void {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const rect = canvas.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top
  const cell = toCell(offsetX, offsetY)

  if (!cell) {
    hideTip()
    emit('hover', null)
    canvas.style.cursor = props.interactive ? 'crosshair' : 'default'
    return
  }

  if (props.interactive) emit('hover', cell)

  const agv = agvAt(cell)
  if (agv) {
    showAgvTip(agv, offsetX, offsetY, wrap)
    canvas.style.cursor = props.interactive ? 'crosshair' : 'pointer'
    return
  }
  const station = stationAt(cell)
  if (station) {
    showStationTip(station, offsetX, offsetY, wrap)
    canvas.style.cursor = props.interactive ? 'crosshair' : 'pointer'
    return
  }
  hideTip()
  canvas.style.cursor = props.interactive ? 'crosshair' : 'default'
}

function onClick(event: MouseEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const cell = toCell(event.clientX - rect.left, event.clientY - rect.top)
  if (!cell) return
  if (props.interactive) {
    emit('cell', cell)
    return
  }
  const agv = agvAt(cell)
  if (agv) emit('select-agv', agv.agvCode)
}

function onPointerLeave(): void {
  hideTip()
  emit('hover', null)
  if (canvasRef.value) canvasRef.value.style.cursor = props.interactive ? 'crosshair' : 'default'
}

watch(
  () => [
    props.map,
    props.agvs,
    props.selectedCode,
    props.showGrid,
    props.showPaths,
    props.showLabels,
    props.showVehicles,
  ],
  scheduleDraw,
  { deep: true },
)

watch(resolved, scheduleDraw)

onMounted(() => {
  draw()
  if (wrapRef.value) {
    observer = new ResizeObserver(() => scheduleDraw())
    observer.observe(wrapRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  if (frame) window.cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="wrapRef" class="map-canvas" :class="{ 'is-interactive': interactive }">
    <canvas
      ref="canvasRef"
      @mousemove="updateHover"
      @mouseleave="onPointerLeave"
      @click="onClick"
    />
    <Transition name="fade">
      <div
        v-if="tip.visible"
        class="map-tip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        <div class="tip-head">
          <span class="tip-dot" :style="{ background: tip.color }" />
          <span class="tip-title">{{ tip.title }}</span>
          <span class="tip-badge">{{ tip.badge }}</span>
        </div>
        <dl class="tip-lines">
          <template v-for="line in tip.lines" :key="line.label">
            <dt>{{ line.label }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
        </dl>
      </div>
    </Transition>
    <div v-if="!map" class="map-empty">
      <span class="map-empty-title">{{ emptyText }}</span>
      <span class="map-empty-sub">请确认后端已配置当前地图（GET /map/current）</span>
    </div>
    <slot name="overlay" />
  </div>
</template>

<style scoped>
.map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 220px;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-inset);
}

.map-canvas.is-interactive canvas {
  cursor: crosshair;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.map-tip {
  position: absolute;
  z-index: 6;
  width: 228px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--surface-glass);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-card-hover);
  pointer-events: none;
}

.tip-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
}

.tip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.tip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tip-badge {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  font-size: 10.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.tip-lines {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  margin: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.tip-lines dt {
  color: var(--text-tertiary);
}

.tip-lines dd {
  margin: 0;
  color: var(--text);
  text-align: right;
}

.map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}

.map-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.map-empty-sub {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
