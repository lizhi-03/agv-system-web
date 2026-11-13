import { computed, ref } from 'vue'
import { chargeAgv, setSpeed, startAgv, stopAgv } from '../api/agv'
import { toast } from './useToast'
import type { AgvSnapshot } from '../types'

type RefreshFn = () => Promise<unknown> | unknown

/** 车辆命令统一封装：in-flight 去重 + toast + 完成后刷新 */
export function useAgvCommand(refresh?: RefreshFn) {
  const actionKey = ref<string | null>(null)
  const busy = computed(() => actionKey.value !== null)

  async function refreshQuiet(): Promise<void> {
    if (!refresh) return
    try {
      await refresh()
    } catch {
      /* 刷新失败由调用方轮询兜底 */
    }
  }

  async function run(key: string, action: () => Promise<unknown>, message: string): Promise<boolean> {
    if (actionKey.value) return false
    actionKey.value = key
    try {
      await action()
      toast.success(message)
      await refreshQuiet()
      return true
    } catch {
      /* http 层已展示错误 */
      return false
    } finally {
      actionKey.value = null
    }
  }

  function start(car: AgvSnapshot): Promise<boolean> {
    return run(`start:${car.agvCode}`, () => startAgv({ agvCode: car.agvCode }), `${car.agvCode} 已恢复运行`)
  }

  function stop(car: AgvSnapshot): Promise<boolean> {
    return run(`stop:${car.agvCode}`, () => stopAgv({ agvCode: car.agvCode }), `${car.agvCode} 已暂停`)
  }

  function charge(car: AgvSnapshot): Promise<boolean> {
    return run(
      `charge:${car.agvCode}`,
      () => chargeAgv(car.agvCode),
      `已向 ${car.agvCode} 下发充电指令`,
    )
  }

  function speed(car: AgvSnapshot, value: number): Promise<boolean> {
    return run(
      `speed:${car.agvCode}`,
      () => setSpeed({ agvCode: car.agvCode, speed: value }),
      `${car.agvCode} 目标速度 ${value} cm/s`,
    )
  }

  return { actionKey, busy, run, start, stop, charge, speed }
}
