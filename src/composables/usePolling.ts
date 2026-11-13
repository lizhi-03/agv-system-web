import { onUnmounted, ref, watch } from 'vue'

export interface PollingOptions {
  /** 基准轮询间隔（ms） */
  interval?: number
  /** 是否立即执行第一次（默认 true） */
  immediate?: boolean
  /** 初始是否启用（默认 true） */
  enabled?: boolean
  /** 连续失败时的最大退避倍数 */
  maxBackoff?: number
  /** 页面隐藏时是否暂停（默认 true） */
  pauseWhenHidden?: boolean
}

/**
 * 轮询组合式函数：
 * - 上一次请求未返回时不会发起下一次（in-flight 去重）
 * - document.visibilityState 隐藏时暂停，恢复可见立即补一次
 * - 连续失败指数退避（最多 maxBackoff 倍），成功后退回基准间隔
 * - 组件卸载自动清理
 */
export function usePolling(task: () => Promise<unknown> | unknown, options: PollingOptions = {}) {
  const interval = options.interval ?? 1000
  const maxBackoff = options.maxBackoff ?? 8
  const pauseWhenHidden = options.pauseWhenHidden ?? true

  const running = ref(options.enabled ?? true)
  const inFlight = ref(false)
  const failures = ref(0)
  const lastRunAt = ref<number | null>(null)

  let timer: number | null = null
  let disposed = false

  function clearTimer(): void {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function delayForNextRun(): number {
    if (failures.value <= 0) return interval
    const factor = Math.min(Math.pow(1.6, failures.value), maxBackoff)
    return Math.round(interval * factor)
  }

  function schedule(delay: number): void {
    clearTimer()
    if (disposed || !running.value) return
    timer = window.setTimeout(() => void run(), delay)
  }

  async function run(): Promise<void> {
    clearTimer()
    if (disposed || !running.value) return
    if (pauseWhenHidden && document.visibilityState === 'hidden') {
      schedule(interval)
      return
    }
    if (inFlight.value) {
      schedule(interval)
      return
    }
    inFlight.value = true
    try {
      await task()
      failures.value = 0
    } catch {
      failures.value = Math.min(failures.value + 1, 6)
    } finally {
      inFlight.value = false
      lastRunAt.value = Date.now()
      schedule(delayForNextRun())
    }
  }

  function start(immediate = true): void {
    running.value = true
    schedule(immediate ? 0 : interval)
  }

  function stop(): void {
    running.value = false
    clearTimer()
  }

  function toggle(): void {
    if (running.value) stop()
    else start(true)
  }

  /** 立即触发一次（保持轮询继续） */
  function refresh(): Promise<void> {
    return run()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      if (pauseWhenHidden) clearTimer()
      return
    }
    if (running.value && !inFlight.value) schedule(0)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  watch(running, (enabled) => {
    if (enabled) schedule(options.immediate === false ? interval : 0)
    else clearTimer()
  })
  schedule(options.immediate === false ? interval : 0)

  onUnmounted(() => {
    disposed = true
    clearTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { running, inFlight, failures, lastRunAt, start, stop, toggle, refresh, run }
}
