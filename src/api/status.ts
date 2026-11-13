import { reactive } from 'vue'

/** 全局后端连接状态：由 api/http.ts 在每次请求后更新，侧栏与概览页消费 */
export interface BackendStatusState {
  /** 最近一次请求是否拿到了 HTTP 响应（业务失败也算可达） */
  reachable: boolean
  /** 是否已经发生过至少一次请求 */
  checked: boolean
  /** 平滑后的往返延迟（ms） */
  latency: number
  lastSuccessAt: number | null
  lastErrorAt: number | null
  lastError: string
}

export const backendStatus = reactive<BackendStatusState>({
  reachable: false,
  checked: false,
  latency: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: '',
})

export function reportReachable(latency: number): void {
  backendStatus.reachable = true
  backendStatus.checked = true
  backendStatus.lastSuccessAt = Date.now()
  backendStatus.lastError = ''
  const sample = Number.isFinite(latency) ? Math.max(1, latency) : 0
  backendStatus.latency = backendStatus.latency
    ? Math.round(backendStatus.latency * 0.6 + sample * 0.4)
    : Math.round(sample)
}

/** 网络层不可达 / 超时 */
export function reportUnreachable(message: string): void {
  backendStatus.reachable = false
  backendStatus.checked = true
  backendStatus.lastError = message
  backendStatus.lastErrorAt = Date.now()
}

/** 服务可达但返回了非 2xx，保留在线状态 */
export function reportHttpError(message: string): void {
  backendStatus.reachable = true
  backendStatus.checked = true
  backendStatus.lastError = message
  backendStatus.lastErrorAt = Date.now()
}
