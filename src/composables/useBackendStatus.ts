import { computed, ref } from 'vue'
import { backendStatus } from '../api/status'
import { request } from '../api/http'

/**
 * 后端连接状态：数据由 api/http.ts 在每次请求后维护；
 * retry 主动探测一次（POST /agv/list 是最轻量的核心接口）。
 */
export function useBackendStatus() {
  const checking = ref(false)

  const online = computed(() => backendStatus.reachable)
  const checked = computed(() => backendStatus.checked)

  async function retry(): Promise<void> {
    if (checking.value) return
    checking.value = true
    try {
      await request<unknown>({ url: '/agv/list', method: 'post' }, true)
    } catch {
      /* 状态已由 http 层记录 */
    } finally {
      checking.value = false
    }
  }

  return { status: backendStatus, online, checked, checking, retry }
}
