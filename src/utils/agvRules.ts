import type { AgvSnapshot } from '../types'

/** 启动按钮禁用原因（空字符串表示可点） */
export function startBlockReason(car: AgvSnapshot): string {
  if (car.taskId === null) return '该车辆当前没有任务，无法启动'
  if (car.status === 'running') return '车辆正在运行中，无需启动'
  if (car.status !== 'stopping') return '仅已暂停（stopping）车辆可启动'
  return ''
}

/** 暂停按钮禁用原因（空字符串表示可点） */
export function stopBlockReason(car: AgvSnapshot): string {
  if (car.taskId === null) return '该车辆当前没有任务，无法暂停'
  if (car.status !== 'running') return '仅运行中车辆可暂停'
  return ''
}

export function canStart(car: AgvSnapshot): boolean {
  return startBlockReason(car) === ''
}

export function canStop(car: AgvSnapshot): boolean {
  return stopBlockReason(car) === ''
}

export function isIdle(car: AgvSnapshot): boolean {
  return car.taskId === null && car.status === 'idle'
}

/** 挑选默认车辆：空闲优先，其次按编号排序 */
export function pickDefaultAgv(list: AgvSnapshot[]): AgvSnapshot | null {
  const idle = list.filter(isIdle).sort((a, b) => a.agvCode.localeCompare(b.agvCode))
  if (idle.length) return idle[0]
  return [...list].sort((a, b) => a.agvCode.localeCompare(b.agvCode))[0] ?? null
}

/** 地图上距目标格最近的空闲车（无坐标时回退默认车） */
export function pickNearestIdleAgv(
  list: AgvSnapshot[],
  point: { x: number; y: number },
): AgvSnapshot | null {
  const idle = list.filter(isIdle)
  if (!idle.length) return pickDefaultAgv(list)
  return idle.reduce((best, car) => {
    const distance = Math.abs(car.x - point.x) + Math.abs(car.y - point.y)
    const bestDistance = Math.abs(best.x - point.x) + Math.abs(best.y - point.y)
    return distance < bestDistance ? car : best
  }, idle[0])
}
