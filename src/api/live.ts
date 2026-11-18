import axios from 'axios'
import { reactive } from 'vue'
import { listAgv, normalizeAgvList } from './agv'
import { http } from './http'
import { reportReachable, reportUnreachable } from './status'
import type { AgvSnapshot } from '../types'

export type LiveMode = 'idle' | 'poll' | 'list' | 'stream'

/** 全局实时数据通道状态：底部连接卡与各页小标识共用 */
export const liveStatus = reactive({
  mode: 'idle' as LiveMode,
  /** 最近一次成功拿到数据（含 304 / SSE 帧）的时间 */
  lastAt: null as number | null,
  /** 实时快照里的地图版本，用于判断是否需要重拉静态地图 */
  mapVersion: null as number | null,
  /** 后端是否支持 /agv/live（业务错误或 404 时临时降级） */
  liveSupported: true,
  /** 后端是否支持 SSE /agv/stream */
  streamSupported: false,
  lastError: '',
})

export interface LivePathPoint {
  agvCode: string
  x: number
  y: number
}

export interface LiveFrame {
  cars: AgvSnapshot[]
  mapVersion: number | null
  timestamp: number | null
  etag: string | null
  transport: 'live' | 'list' | 'stream'
  /** SSE/live 帧里的占用路径（可选） */
  paths: LivePathPoint[] | null
}

export interface StreamHandlers {
  onFrame: (frame: LiveFrame) => void
  onOpen: () => void
  onError: () => void
}

function toNumberOrNull(value: unknown): number | null {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function extractMapVersion(record: Record<string, unknown> | null): number | null {
  if (!record) return null
  const map = record.map
  if (map && typeof map === 'object') {
    const version = toNumberOrNull((map as Record<string, unknown>).version)
    if (version != null) return version
  }
  return toNumberOrNull(record.mapVersion)
}

function normalizePaths(raw: unknown): LivePathPoint[] | null {
  if (!Array.isArray(raw)) return null
  const points: LivePathPoint[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const agvCode = String(record.agvCode ?? record.AgvCode ?? '')
    if (!agvCode) continue
    points.push({
      agvCode,
      x: toNumberOrNull(record.x) ?? 0,
      y: toNumberOrNull(record.y) ?? 0,
    })
  }
  return points
}

/** 从 /agv/live 或 SSE 帧数据中解析统一快照（兼容 {code,data} 包装与裸对象） */
export function parseLivePayload(
  payload: unknown,
  fallbackEtag: string | null,
  transport: 'live' | 'stream',
): LiveFrame | null {
  if (payload == null) return null
  const wrapper =
    payload && typeof payload === 'object'
      ? (payload as { code?: number; msg?: string | null; data?: unknown })
      : null
  const body =
    wrapper && typeof wrapper.code === 'number'
      ? wrapper.code === 200
        ? wrapper.data
        : null
      : payload
  if (body == null) return null
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  const rawCars = Array.isArray(body) ? body : record?.cars ?? record?.agvs ?? record?.vehicles ?? []
  if (!Array.isArray(rawCars)) return null
  const payloadEtag = record?.etag
  const etag = typeof payloadEtag === 'string' ? payloadEtag : fallbackEtag
  return {
    cars: normalizeAgvList(rawCars),
    mapVersion: extractMapVersion(record),
    timestamp: toNumberOrNull(record?.timestamp),
    etag,
    transport,
    paths: normalizePaths(record?.paths),
  }
}

/** 实时接口不可用时的重试时间（业务错误临时降级，到期后再试） */
let liveRetryAt = 0

async function fetchListFrame(): Promise<LiveFrame> {
  const cars = await listAgv(true)
  return {
    cars,
    mapVersion: null,
    timestamp: Date.now(),
    etag: null,
    transport: 'list',
    paths: null,
  }
}

/**
 * 拉取合并快照：
 * - 优先 GET /agv/live（支持 If-None-Match，304 表示无变化）
 * - 接口不存在（404/405/501）或返回业务错误时，自动降级为旧版 POST /agv/list，并定时重试 live
 * - 每次成功后更新 liveStatus，供连接卡展示数据源
 */
export async function fetchLiveFrame(
  etag: string | null,
): Promise<{ notModified: boolean; frame: LiveFrame | null }> {
  if (!liveStatus.liveSupported && Date.now() >= liveRetryAt) {
    liveStatus.liveSupported = true
  }
  if (!liveStatus.liveSupported) {
    const frame = await fetchListFrame()
    liveStatus.mode = 'list'
    liveStatus.lastAt = Date.now()
    return { notModified: false, frame }
  }
  const startedAt = performance.now()
  try {
    const response = await http.request<unknown>({
      url: '/agv/live',
      method: 'get',
      headers: etag ? { 'If-None-Match': etag } : undefined,
      validateStatus: (status) =>
        status === 200 || status === 304 || status === 404 || status === 405 || status === 501,
    })
    // 只走实时通道的页面（地图/车队）也要让侧栏连接卡拿到可达性与延迟
    reportReachable(performance.now() - startedAt)
    if (response.status === 304) {
      liveStatus.mode = 'poll'
      liveStatus.lastAt = Date.now()
      liveStatus.lastError = ''
      return { notModified: true, frame: null }
    }
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      liveStatus.liveSupported = false
      liveRetryAt = Date.now() + 300000
      liveStatus.mode = 'list'
      const frame = await fetchListFrame()
      liveStatus.lastAt = Date.now()
      return { notModified: false, frame }
    }
    const body = response.data
    const wrapper =
      body && typeof body === 'object'
        ? (body as { code?: number; msg?: string | null })
        : null
    if (wrapper && typeof wrapper.code === 'number' && wrapper.code !== 200) {
      // 实时通道暂不可用（后端未就绪/无快照）：临时降级轮询，60s 后自动重试 live
      liveStatus.liveSupported = false
      liveRetryAt = Date.now() + 60000
      liveStatus.mode = 'list'
      const frame = await fetchListFrame()
      liveStatus.lastAt = Date.now()
      liveStatus.lastError = wrapper.msg || ''
      return { notModified: false, frame }
    }
    const headerEtag = response.headers?.etag
    const frame = parseLivePayload(
      body,
      typeof headerEtag === 'string' ? headerEtag : etag,
      'live',
    )
    if (!frame) {
      liveStatus.lastError = '实时快照响应格式异常'
      throw new Error('实时快照响应格式异常')
    }
    liveStatus.mode = 'poll'
    liveStatus.lastAt = Date.now()
    liveStatus.mapVersion = frame.mapVersion
    liveStatus.lastError = ''
    return { notModified: false, frame }
  } catch (error) {
    liveStatus.lastError = error instanceof Error ? error.message : '实时快照请求失败'
    if (axios.isAxiosError(error) && !error.response) {
      reportUnreachable('无法连接后端服务，请确认后端已启动')
    }
    throw error
  }
}

/**
 * SSE 实时通道：变化才推、≤1 帧/s、15s 心跳。
 * 返回 EventSource（不支持时返回 null，由调用方降级轮询）。
 */
export function connectStream(handlers: StreamHandlers): EventSource | null {
  if (typeof EventSource === 'undefined') return null
  const source = new EventSource('/api/agv/stream')
  const handleEvent = (event: Event): void => {
    let raw: unknown = null
    try {
      raw = JSON.parse((event as MessageEvent).data)
    } catch {
      return
    }
    const frame = parseLivePayload(raw, null, 'stream')
    if (!frame) return
    liveStatus.mode = 'stream'
    liveStatus.lastAt = Date.now()
    liveStatus.mapVersion = frame.mapVersion
    liveStatus.lastError = ''
    handlers.onFrame(frame)
  }
  source.addEventListener('open', () => {
    liveStatus.streamSupported = true
    liveStatus.mode = 'stream'
    liveStatus.lastError = ''
    handlers.onOpen()
  })
  // 后端使用 named event（event:state）；同时兼容默认 message 事件
  source.addEventListener('state', handleEvent)
  source.addEventListener('message', handleEvent)
  source.addEventListener('error', () => {
    liveStatus.lastError = '实时推送连接中断'
    handlers.onError()
  })
  return source
}
