<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { AgvMap, AgvSnapshot, PathNode, Station } from '../types'
import { agvStatusMeta, toNumber } from '../utils/labels'
import { agvColor, withAlpha } from '../utils/colors'
import { useTheme } from '../composables/useTheme'

const props = withDefaults(
  defineProps<{
    map: AgvMap | null
    agvs?: AgvSnapshot[]
    selectedCode?: string | null
    selectedStationId?: string | null
    startStationId?: string | null
    endStationId?: string | null
    showGrid?: boolean
    showPaths?: boolean
    showLabels?: boolean
    showVehicles?: boolean
    /** 编辑器模式：左键拖拽连续绘制 */
    interactive?: boolean
    /** 站点选点模式（任务向导）：同格有车辆时优先选中站点 */
    pickStations?: boolean
    pannable?: boolean
    zoomable?: boolean
    brushSize?: number
    highlightPath?: PathNode[] | null
    emptyText?: string
    minCell?: number
  }>(),
  {
    agvs: () => [],
    selectedCode: null,
    selectedStationId: null,
    startStationId: null,
    endStationId: null,
    showGrid: true,
    showPaths: true,
    showLabels: true,
    showVehicles: true,
    interactive: false,
    pickStations: false,
    pannable: true,
    zoomable: true,
    brushSize: 1,
    highlightPath: null,
    emptyText: '暂无地图数据',
    minCell: 3,
  },
)

const emit = defineEmits<{
  cell: [payload: { x: number; y: number }]
  'stroke-start': []
  'stroke-end': []
  'agv-click': [payload: { code: string; x: number; y: number }]
  'station-click': [payload: { station: Station; x: number; y: number }]
  'background-click': []
  'viewport-change': [payload: { zoom: number; percent: number }]
  hover: [payload: { x: number; y: number } | null]
}>()

const { resolved } = useTheme()
const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const MIN_ZOOM = 0.5
const MAX_ZOOM = 6
const view = { zoom: 1, panX: 0, panY: 0 }

const hoverCell = ref<{ x: number; y: number } | null>(null)
const tip = reactive({
  visible: false,
  left: 0,
  top: 0,
  title: '',
  badge: '',
  color: '#0a84ff',
  lines: [] as { label: string; value: string }[],
})

interface Metrics {
  width: number
  height: number
  baseCell: number
  cell: number
  originX: number
  originY: number
}

let metrics: Metrics = { width: 0, height: 0, baseCell: 0, cell: 0, originX: 0, originY: 0 }
let observer: ResizeObserver | null = null
let frame = 0
let panning = false
let painting = false
let spacePressed = false
let pointerInside = false
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 }
let dragMoved = false
const paintedCells = new Set<string>()

const positions = new Map<string, { x: number; y: number }>()
const headings = new Map<string, number>()
const TAU = Math.PI * 2

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 根据当前画布尺寸与缩放计算布局 */
function layout(): Metrics {
  const map = props.map
  const width = metrics.width
  const height = metrics.height
  if (!map || map.width <= 0 || map.height <= 0 || width <= 0 || height <= 0) {
    metrics = { width, height, baseCell: 0, cell: 0, originX: 0, originY: 0 }
    return metrics
  }
  const pad = clamp(Math.round(Math.min(width, height) * 0.03), 10, 24)
  const baseCell = Math.max(
    props.minCell,
    Math.floor(Math.min((width - pad * 2) / map.width, (height - pad * 2) / map.height)),
  )
  const cell = baseCell * view.zoom
  const boardWidth = cell * map.width
  const boardHeight = cell * map.height
  const originX = width / 2 + view.panX - boardWidth / 2
  const originY = height / 2 + view.panY - boardHeight / 2
  metrics = { width, height, baseCell, cell, originX, originY }
  return metrics
}

function clampPan(): void {
  const map = props.map
  if (!map || metrics.width <= 0) return
  const boardWidth = metrics.baseCell * view.zoom * map.width
  const boardHeight = metrics.baseCell * view.zoom * map.height
  const maxPanX = Math.max(0, metrics.width / 2 + boardWidth / 2 - 120)
  const maxPanY = Math.max(0, metrics.height / 2 + boardHeight / 2 - 120)
  view.panX = clamp(view.panX, -maxPanX, maxPanX)
  view.panY = clamp(view.panY, -maxPanY, maxPanY)
}

function emitViewport(): void {
  emit('viewport-change', { zoom: view.zoom, percent: Math.round(view.zoom * 100) })
}

function cellTopLeft(x: number, y: number): { px: number; py: number } {
  const height = props.map?.height ?? 0
  return {
    px: metrics.originX + x * metrics.cell,
    py: metrics.originY + (height - 1 - y) * metrics.cell,
  }
}

function cellCenter(x: number, y: number): { cx: number; cy: number } {
  const { px, py } = cellTopLeft(x, y)
  return { cx: px + metrics.cell / 2, cy: py + metrics.cell / 2 }
}

function toCell(px: number, py: number): { x: number; y: number } | null {
  const map = props.map
  if (!map || metrics.cell <= 0) return null
  const gx = Math.floor((px - metrics.originX) / metrics.cell)
  const row = Math.floor((py - metrics.originY) / metrics.cell)
  if (gx < 0 || row < 0 || gx >= map.width || row >= map.height) return null
  return { x: gx, y: map.height - 1 - row }
}

function insideBoard(x: number, y: number): boolean {
  const map = props.map
  if (!map) return false
  return x >= 0 && y >= 0 && x < map.width && y < map.height
}

function agvAt(cell: { x: number; y: number }): AgvSnapshot | undefined {
  return props.agvs.find((agv) => agv.x === cell.x && agv.y === cell.y)
}

function stationAt(cell: { x: number; y: number }): Station | undefined {
  return (props.map?.stations ?? []).find((station) => station.x === cell.x && station.y === cell.y)
}

function headingFor(agv: AgvSnapshot): number {
  const previous = positions.get(agv.agvCode)
  if (previous && (previous.x !== agv.x || previous.y !== agv.y)) {
    const dx = agv.x - previous.x
    const dy = agv.y - previous.y
    if (dx !== 0 || dy !== 0) {
      headings.set(agv.agvCode, Math.atan2(-dy, dx))
    }
  }
  positions.set(agv.agvCode, { x: agv.x, y: agv.y })
  const moved = headings.get(agv.agvCode)
  if (moved != null) return moved
  return (-toNumber(agv.direction) * Math.PI) / 180
}

function drawTagLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  cell: number,
): void {
  const fontFamily = cssVar('--font-sans')
  const fontSize = Math.max(9, Math.min(12, Math.round(cell * 0.34)))
  ctx.font = `600 ${fontSize}px ${fontFamily}`
  const textWidth = ctx.measureText(text).width
  const paddingX = 5
  const boxWidth = textWidth + paddingX * 2
  const boxHeight = fontSize + 6
  roundRect(ctx, cx - boxWidth / 2, cy - boxHeight / 2, boxWidth, boxHeight, boxHeight / 2)
  ctx.fillStyle = cssVar('--map-label-bg')
  ctx.fill()
  ctx.fillStyle = cssVar('--map-label')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy + 0.5)
}

function drawBolt(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
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

function drawPathPolyline(
  ctx: CanvasRenderingContext2D,
  path: PathNode[],
  color: string,
  width: number,
  alpha: number,
  dashed = false,
): void {
  if (path.length < 2) return
  ctx.save()
  ctx.beginPath()
  path.forEach((node, index) => {
    const { cx, cy } = cellCenter(node.x, node.y)
    if (index === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  })
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = withAlpha(color, alpha)
  ctx.lineWidth = width
  if (dashed) ctx.setLineDash([Math.max(6, width * 2), Math.max(5, width * 1.4)])
  ctx.stroke()
  ctx.restore()
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
    metrics = { width, height, baseCell: 0, cell: 0, originX: 0, originY: 0 }
    return
  }

  metrics = { ...metrics, width, height }
  layout()
  const { cell, originX, originY } = metrics
  const boardWidth = cell * map.width
  const boardHeight = cell * map.height

  // 底板
  roundRect(ctx, originX, originY, boardWidth, boardHeight, Math.min(18, cell * 0.6))
  ctx.fillStyle = cssVar('--map-bg')
  ctx.fill()
  ctx.strokeStyle = cssVar('--separator')
  ctx.lineWidth = 1
  ctx.stroke()

  // 网格
  if (props.showGrid && cell >= 4) {
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

  // 已占用路径
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

  // 规划路径
  if (props.showPaths) {
    for (const agv of props.agvs) {
      if (!agv.plannedPath || agv.plannedPath.length < 2) continue
      const color = agvColor(agv.agvCode)
      const selected = props.selectedCode === agv.agvCode
      drawPathPolyline(
        ctx,
        agv.plannedPath,
        color,
        Math.max(2.5, cell * (selected ? 0.2 : 0.16)),
        selected ? 0.5 : 0.24,
      )
      drawPathPolyline(ctx, agv.plannedPath, color, Math.max(1, cell * 0.06), selected ? 1 : 0.6)
    }
  }

  // 预览/高亮路径
  if (props.highlightPath && props.highlightPath.length > 1) {
    const accent = cssVar('--accent')
    drawPathPolyline(ctx, props.highlightPath, accent, Math.max(3, cell * 0.24), 0.22)
    drawPathPolyline(ctx, props.highlightPath, accent, Math.max(2, cell * 0.12), 0.95, true)
    const first = props.highlightPath[0]
    const last = props.highlightPath[props.highlightPath.length - 1]
    const start = cellCenter(first.x, first.y)
    const end = cellCenter(last.x, last.y)
    ctx.beginPath()
    ctx.arc(start.cx, start.cy, Math.max(4, cell * 0.2), 0, TAU)
    ctx.fillStyle = accent
    ctx.fill()
    ctx.beginPath()
    ctx.arc(end.cx, end.cy, Math.max(4, cell * 0.24), 0, TAU)
    ctx.fillStyle = cssVar('--green')
    ctx.fill()
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

    let ring: string | null = null
    if (station.id === props.startStationId) ring = cssVar('--accent')
    else if (station.id === props.endStationId) ring = cssVar('--green')
    else if (station.id === props.selectedStationId) ring = cssVar('--accent')
    if (ring) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius + Math.max(4, cell * 0.14), 0, TAU)
      ctx.strokeStyle = ring
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
    if (props.showLabels && cell >= 10) {
      drawTagLabel(ctx, station.id, cx, cy - Math.max(7, cell * 0.36), cell)
    }
  }

  // 车辆（同格多车轻微错位）
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
        ctx.beginPath()
        ctx.moveTo(bodyLength / 2 - 1, 0)
        ctx.lineTo(bodyLength / 2 - Math.max(3, bodyLength * 0.26), -bodyWidth * 0.3)
        ctx.lineTo(bodyLength / 2 - Math.max(3, bodyLength * 0.26), bodyWidth * 0.3)
        ctx.closePath()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.fill()
        ctx.restore()

        if (props.showLabels && cell >= 11) {
          drawTagLabel(ctx, agv.agvCode, cx, py - Math.max(2, cell * 0.1), cell)
        }
      })
    }
  }

  // 编辑器笔刷预览
  if (props.interactive && hoverCell.value) {    const size = Math.max(1, props.brushSize)
    const offset = Math.floor(size / 2)
    const startX = hoverCell.value.x - offset
    const startY = hoverCell.value.y - offset
    const { px, py } = cellTopLeft(startX, startY)
    const boxW = cell * size
    const boxH = cell * size
    roundRect(ctx, px, py, boxW, boxH, Math.max(2, cell * 0.16))
    ctx.fillStyle = withAlpha(cssVar('--accent'), 0.16)
    ctx.fill()
    ctx.strokeStyle = cssVar('--accent')
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function scheduleDraw(): void {
  if (frame) window.cancelAnimationFrame(frame)
  frame = window.requestAnimationFrame(() => {
    frame = 0
    draw()
  })
}

/* ------------------------------ 缩放 / 平移 ------------------------------ */

function zoomTo(nextZoom: number, anchor?: { x: number; y: number }): void {
  const map = props.map
  if (!map) return
  const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  if (Math.abs(clamped - view.zoom) < 0.0001) return
  layout()
  const previousCell = metrics.cell
  const previousOriginX = metrics.originX
  const previousOriginY = metrics.originY
  const ax = anchor ? anchor.x : metrics.width / 2
  const ay = anchor ? anchor.y : metrics.height / 2
  const worldX = previousCell > 0 ? (ax - previousOriginX) / previousCell : map.width / 2
  const worldY = previousCell > 0 ? (ay - previousOriginY) / previousCell : map.height / 2
  view.zoom = clamped
  const nextCell = metrics.baseCell * view.zoom
  view.panX = ax - worldX * nextCell - metrics.width / 2 + (nextCell * map.width) / 2
  view.panY = ay - worldY * nextCell - metrics.height / 2 + (nextCell * map.height) / 2
  clampPan()
  draw()
  emitViewport()
}

function fit(): void {
  view.zoom = 1
  view.panX = 0
  view.panY = 0
  draw()
  emitViewport()
}

function oneToOne(): void {
  const map = props.map
  if (!map) return
  layout()
  const targetCell = map.cellSize && map.cellSize > 0 ? map.cellSize : 20
  if (metrics.baseCell <= 0) return
  zoomTo(targetCell / metrics.baseCell)
}

function focusCell(x: number, y: number, zoom = 2): void {
  const map = props.map
  if (!map) return
  view.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  layout()
  const cell = metrics.cell
  view.panX = (cell * map.width) / 2 - (x + 0.5) * cell
  view.panY = (cell * map.height) / 2 - (map.height - 1 - y + 0.5) * cell
  clampPan()
  draw()
  emitViewport()
}

function zoomIn(): void {
  zoomTo(view.zoom * 1.3)
}

function zoomOut(): void {
  zoomTo(view.zoom / 1.3)
}

defineExpose({ zoomIn, zoomOut, fit, oneToOne, focusCell, getZoom: () => view.zoom })

/* ------------------------------ 命中 / tooltip ------------------------------ */

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

function localPoint(event: MouseEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function updateHover(event: PointerEvent): void {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  const local = localPoint(event)
  if (!canvas || !wrap || !local) return
  const cell = toCell(local.x, local.y)
  if (!cell) {
    hideTip()
    hoverCell.value = null
    emit('hover', null)
    if (!panning && !spacePressed) canvas.style.cursor = props.pannable ? 'grab' : 'default'
    return
  }
  hoverCell.value = cell
  emit('hover', cell)
  const agv = agvAt(cell)
  const station = stationAt(cell)
  // 向导选点模式：站点优先命中（车辆可能停靠在站点格上）
  if (props.pickStations && station) {
    showStationTip(station, local.x, local.y, wrap)
    if (!panning) canvas.style.cursor = spacePressed ? 'grab' : 'pointer'
    return
  }
  if (agv) {
    showAgvTip(agv, local.x, local.y, wrap)
    if (!panning) canvas.style.cursor = spacePressed ? 'grab' : props.interactive ? 'crosshair' : 'pointer'
  } else if (station) {
    showStationTip(station, local.x, local.y, wrap)
    if (!panning) canvas.style.cursor = spacePressed ? 'grab' : props.interactive ? 'crosshair' : 'pointer'
  } else {
    hideTip()
    if (!panning) {
      canvas.style.cursor = spacePressed
        ? 'grab'
        : props.interactive
          ? 'crosshair'
          : props.pannable
            ? 'grab'
            : 'default'
    }
  }
}

/* ------------------------------ 交互 ------------------------------ */

function onWheel(event: WheelEvent): void {
  if (!props.zoomable) return
  event.preventDefault()
  const local = localPoint(event)
  const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0016))
  zoomTo(view.zoom * factor, local ?? undefined)
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code !== 'Space' || !pointerInside || isTypingTarget(event.target)) return
  spacePressed = true
  event.preventDefault()
  if (canvasRef.value && !panning) canvasRef.value.style.cursor = 'grab'
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code !== 'Space') return
  spacePressed = false
  if (canvasRef.value && !panning) {
    canvasRef.value.style.cursor = props.interactive ? 'crosshair' : props.pannable ? 'grab' : 'default'
  }
}

function paintAt(event: PointerEvent | MouseEvent): void {
  const local = localPoint(event)
  if (!local) return
  const cell = toCell(local.x, local.y)
  if (!cell) return
  const key = `${cell.x},${cell.y}`
  if (paintedCells.has(key)) return
  paintedCells.add(key)
  emit('cell', cell)
}

function onPointerDown(event: PointerEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  hideTip()
  dragStart = { x: event.clientX, y: event.clientY, panX: view.panX, panY: view.panY }
  dragMoved = false
  canvas.setPointerCapture(event.pointerId)
  const wantsPan =
    event.button === 1 ||
    event.button === 2 ||
    spacePressed ||
    (!props.interactive && props.pannable && event.button === 0)
  if (props.interactive && event.button === 0 && !spacePressed) {
    painting = true
    paintedCells.clear()
    emit('stroke-start')
    paintAt(event)
    canvas.style.cursor = 'crosshair'
    event.preventDefault()
    return
  }
  if (wantsPan) {
    panning = true
    canvas.style.cursor = 'grabbing'
    event.preventDefault()
  }
}

function onPointerMove(event: PointerEvent): void {
  if (painting) {
    paintAt(event)
    updateHover(event)
    return
  }
  if (panning) {
    const dx = event.clientX - dragStart.x
    const dy = event.clientY - dragStart.y
    if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true
    view.panX = dragStart.panX + dx
    view.panY = dragStart.panY + dy
    clampPan()
    draw()
    emitViewport()
    return
  }
  updateHover(event)
}

function handleClick(event: PointerEvent): void {
  const local = localPoint(event)
  if (!local) return
  const cell = toCell(local.x, local.y)
  if (!cell) {
    emit('background-click')
    return
  }
  const station = stationAt(cell)
  // 向导选点模式：站点优先（站点可能被空闲车辆停靠）
  if (props.pickStations && station) {
    const { cx, cy } = cellCenter(cell.x, cell.y)
    emit('station-click', { station, x: cx, y: cy })
    return
  }
  const agv = agvAt(cell)
  if (agv) {
    const { cx, cy } = cellCenter(cell.x, cell.y)
    emit('agv-click', { code: agv.agvCode, x: cx, y: cy })
    return
  }
  if (station) {
    const { cx, cy } = cellCenter(cell.x, cell.y)
    emit('station-click', { station, x: cx, y: cy })
    return
  }
  emit('background-click')
}

function onPointerUp(event: PointerEvent): void {
  const canvas = canvasRef.value
  if (canvas) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch {
      /* 忽略 */
    }
  }
  if (painting) {
    paintAt(event)
    painting = false
    emit('stroke-end')
  }
  if (panning) {
    panning = false
    if (canvas) {
      canvas.style.cursor = props.interactive ? 'crosshair' : props.pannable ? 'grab' : 'default'
    }
  }
  if (!dragMoved && !props.interactive && event.button === 0) {
    handleClick(event)
  }
}

function onPointerLeave(): void {
  pointerInside = false
  hideTip()
  hoverCell.value = null
  emit('hover', null)
  if (canvasRef.value) {
    canvasRef.value.style.cursor = props.interactive ? 'crosshair' : props.pannable ? 'grab' : 'default'
  }
}

function onDoubleClick(event: MouseEvent): void {
  if (!props.zoomable || props.interactive) return
  const local = localPoint(event)
  zoomTo(view.zoom * 1.5, local ?? undefined)
}

function onContextMenu(event: MouseEvent): void {
  event.preventDefault()
}

watch(
  () => [
    props.map,
    props.agvs,
    props.selectedCode,
    props.selectedStationId,
    props.startStationId,
    props.endStationId,
    props.showGrid,
    props.showPaths,
    props.showLabels,
    props.showVehicles,
    props.highlightPath,
    props.brushSize,
  ],
  scheduleDraw,
)

// 只有编辑器会原地修改地图（push/splice），才需要深度监听；
// 实时页的数据每帧整体替换，浅比较即可，避免每帧遍历整份地图和车辆路径
watch(
  () => (props.interactive ? props.map : null),
  scheduleDraw,
  { deep: true },
)

watch(
  () => [props.map?.mapId, props.map?.width, props.map?.height],
  () => {
    view.zoom = 1
    view.panX = 0
    view.panY = 0
    scheduleDraw()
    emitViewport()
  },
)

watch(resolved, scheduleDraw)

onMounted(() => {
  draw()
  emitViewport()
  const canvas = canvasRef.value
  if (canvas) {
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerenter', () => {
      pointerInside = true
    })
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  if (wrapRef.value) {
    observer = new ResizeObserver(() => {
      clampPan()
      scheduleDraw()
    })
    observer.observe(wrapRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  if (frame) window.cancelAnimationFrame(frame)
  const canvas = canvasRef.value
  if (canvas) canvas.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div ref="wrapRef" class="map-canvas" :class="{ 'is-interactive': interactive }">
    <canvas
      ref="canvasRef"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @dblclick="onDoubleClick"
      @contextmenu="onContextMenu"
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
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.map-canvas.is-interactive canvas {
  cursor: crosshair;
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
