import { onUnmounted, ref } from 'vue'
import { connectStream, fetchLiveFrame, liveStatus, type LiveFrame } from '../api/live'
import { getCurrentMap } from '../api/map'
import type { AgvMap, AgvSnapshot } from '../types'

export interface LiveStateOptions {
  /** 有 running/charging/stopping 车辆时的轮询间隔（ms） */
  runningInterval?: number
  /** 全空闲时的轮询间隔（ms） */
  idleInterval?: number
}

/**
 * 合并快照数据通道：
 * - 优先 SSE `/api/agv/stream`；连接成功后停掉轮询（单通道原则）
 * - SSE 不可用/断线：指数退避重连最多 3 次，之后降级 `GET /agv/live`（304 无变化）自适应轮询
 * - `/agv/live` 不可用时再降级旧版 `POST /agv/list`
 * - 静态地图只加载一次，仅当 live.mapVersion 变化时重新 GET /map/current
 * - 有运行/充电车 1s，全空闲 5s；页面隐藏暂停轮询；恢复可见立即补拉
 */
export function useLiveState(options: LiveStateOptions = {}) {
  const runningInterval = options.runningInterval ?? 1000
  const idleInterval = options.idleInterval ?? 5000

  const mapData = ref<AgvMap | null>(null)
  const agvs = ref<AgvSnapshot[]>([])
  const errorText = ref('')
  const booted = ref(false)
  const paused = ref(false)
  const lastSync = ref<number | null>(null)

  let etag: string | null = null
  let pollTimer: number | null = null
  let reconnectTimer: number | null = null
  let inFlight = false
  let disposed = false
  let failures = 0
  let stream: EventSource | null = null
  let streamActive = false
  let streamAttempts = 0
  let lastFrameAt = 0

  function clearPollTimer(): void {
    if (pollTimer != null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer != null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function closeStream(): void {
    streamActive = false
    if (stream) {
      stream.close()
      stream = null
    }
  }

  function hasBusyCar(list: AgvSnapshot[]): boolean {
    return list.some(
      (car) => car.status === 'running' || car.status === 'charging' || car.status === 'stopping',
    )
  }

  function nextInterval(): number {
    return hasBusyCar(agvs.value) ? runningInterval : idleInterval
  }

  function schedulePoll(delay: number): void {
    clearPollTimer()
    if (disposed || paused.value || streamActive) return
    pollTimer = window.setTimeout(() => void pollTick(), delay)
  }

  async function ensureMap(version: number | null): Promise<void> {
    const current = mapData.value
    if (current && (version == null || (current.version ?? 0) === version)) return
    try {
      const map = await getCurrentMap(true)
      if (map) mapData.value = map
    } catch {
      /* 地图拉取失败不阻塞车辆实时数据 */
    }
  }

  function applyFrame(frame: LiveFrame): void {
    agvs.value = frame.cars
    if (frame.paths && mapData.value) {
      mapData.value = {
        ...mapData.value,
        paths: frame.paths.map((point) => ({
          x: point.x,
          y: point.y,
          agvCode: point.agvCode,
          type: 'path',
        })),
      }
    }
    lastSync.value = Date.now()
    errorText.value = ''
    liveStatus.lastAt = Date.now()
    liveStatus.lastError = ''
    failures = 0
  }

  async function pollTick(): Promise<void> {
    if (disposed || streamActive) return
    if (document.hidden) {
      schedulePoll(2000)
      return
    }
    if (inFlight) {
      schedulePoll(nextInterval())
      return
    }
    inFlight = true
    try {
      const result = await fetchLiveFrame(etag)
      if (streamActive) {
        // SSE 已接管：丢弃这次轮询结果并保持通道标识为实时推送
        liveStatus.mode = 'stream'
        return
      }
      if (!result.notModified && result.frame) {
        etag = result.frame.etag ?? etag
        applyFrame(result.frame)
        await ensureMap(result.frame.mapVersion)
        liveStatus.mode = result.frame.transport === 'list' ? 'list' : 'poll'
        liveStatus.mapVersion = result.frame.mapVersion ?? mapData.value?.version ?? null
      } else {
        lastSync.value = Date.now()
      }
      errorText.value = ''
      failures = 0
    } catch (error) {
      failures = Math.min(failures + 1, 5)
      errorText.value = error instanceof Error ? error.message : '实时数据获取失败'
      liveStatus.lastError = errorText.value
    } finally {
      booted.value = true
      inFlight = false
      const delay = failures
        ? Math.min(nextInterval() * Math.pow(1.8, failures), 15000)
        : nextInterval()
      schedulePoll(delay)
    }
  }

  async function applyStreamFrame(frame: LiveFrame): Promise<void> {
    lastFrameAt = Date.now()
    applyFrame(frame)
    await ensureMap(frame.mapVersion)
    liveStatus.mode = 'stream'
    liveStatus.mapVersion = frame.mapVersion ?? mapData.value?.version ?? null
    booted.value = true
  }

  function startWatchdog(): void {
    // SSE 空闲时只发心跳、不推状态帧，因此不使用无帧看门狗；
    // 连接异常由 EventSource 的 error 事件触发起重连/降级。
  }

  function handleStreamFailure(): void {
    closeStream()
    if (disposed || paused.value) return
    streamAttempts += 1
    if (streamAttempts > 3) {
      liveStatus.streamSupported = false
      schedulePoll(0)
      return
    }
    const delay = Math.min(1000 * Math.pow(2, streamAttempts - 1), 8000)
    clearReconnectTimer()
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      openStream()
    }, delay)
  }

  function openStream(): void {
    if (disposed || paused.value || stream) return
    clearReconnectTimer()
    const source = connectStream({
      onOpen: () => {
        streamActive = true
        streamAttempts = 0
        lastFrameAt = Date.now()
        clearPollTimer()
        startWatchdog()
      },
      onFrame: (frame) => {
        void applyStreamFrame(frame)
      },
      onError: () => {
        handleStreamFailure()
      },
    })
    if (!source) {
      schedulePoll(0)
      return
    }
    stream = source
    lastFrameAt = Date.now()
    startWatchdog()
  }

  /** 写操作后主动拉一次，保证 UI 立刻反映新状态（不等下一帧推送） */
  async function pullOnce(): Promise<void> {
    if (disposed || inFlight) return
    inFlight = true
    try {
      const result = await fetchLiveFrame(null)
      if (result.frame) {
        etag = result.frame.etag ?? etag
        applyFrame(result.frame)
        await ensureMap(result.frame.mapVersion)
        liveStatus.mapVersion = result.frame.mapVersion ?? mapData.value?.version ?? null
      }
      if (streamActive) liveStatus.mode = 'stream'
      booted.value = true
    } catch {
      /* 保持上一帧 */
    } finally {
      inFlight = false
    }
  }

  function refresh(): void {
    etag = null
    failures = 0
    if (streamActive) {
      void pullOnce()
      return
    }
    schedulePoll(0)
  }

  function start(): void {
    paused.value = false
    streamAttempts = 0
    // 先尝试 SSE；1.5s 内未建立连接才回退轮询，避免建立 SSE 时多发一次 /agv/live
    openStream()
    schedulePoll(1500)
  }

  function stop(): void {
    paused.value = true
    clearPollTimer()
    clearReconnectTimer()
    closeStream()
  }

  function toggle(): void {
    if (paused.value) start()
    else stop()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      clearPollTimer()
      return
    }
    if (paused.value) return
    if (streamActive) {
      if (Date.now() - lastFrameAt > 5000) void pullOnce()
      return
    }
    schedulePoll(0)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  openStream()
  schedulePoll(1500)

  onUnmounted(() => {
    disposed = true
    clearPollTimer()
    clearReconnectTimer()
    closeStream()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { mapData, agvs, errorText, booted, paused, lastSync, start, stop, toggle, refresh }
}
