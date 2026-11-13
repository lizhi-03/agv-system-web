export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal' | 'gray'

export interface StatusMeta {
  text: string
  tone: Tone
}

const AGV_STATUS: Record<string, StatusMeta> = {
  idle: { text: '空闲', tone: 'gray' },
  running: { text: '运行中', tone: 'green' },
  stopping: { text: '已暂停', tone: 'orange' },
  charging: { text: '充电中', tone: 'purple' },
  error: { text: '异常', tone: 'red' },
}

const TASK_STATUS: Record<string, StatusMeta> = {
  waiting: { text: '等待', tone: 'orange' },
  processing: { text: '执行中', tone: 'blue' },
  paused: { text: '已暂停', tone: 'purple' },
  completed: { text: '已完成', tone: 'green' },
  failed: { text: '失败', tone: 'red' },
  cancelled: { text: '已取消', tone: 'gray' },
}

const LOG_LEVEL: Record<string, StatusMeta> = {
  info: { text: '信息', tone: 'blue' },
  warning: { text: '警告', tone: 'orange' },
  error: { text: '错误', tone: 'red' },
}

const PRIORITY: Record<string, StatusMeta> = {
  low: { text: '低', tone: 'gray' },
  medium: { text: '中', tone: 'blue' },
  high: { text: '高', tone: 'red' },
}

export function agvStatusMeta(status?: string | null): StatusMeta {
  if (!status) return { text: '未知', tone: 'gray' }
  return AGV_STATUS[status] ?? { text: status, tone: 'gray' }
}

export function taskStatusMeta(status?: string | null): StatusMeta {
  if (!status) return { text: '未知', tone: 'gray' }
  return TASK_STATUS[status] ?? { text: status, tone: 'gray' }
}

export function logLevelMeta(level?: string | null): StatusMeta {
  if (!level) return { text: '信息', tone: 'blue' }
  return LOG_LEVEL[level] ?? { text: level, tone: 'gray' }
}

export function priorityMeta(priority?: string | null): StatusMeta {
  if (!priority) return { text: '—', tone: 'gray' }
  return PRIORITY[priority] ?? { text: priority, tone: 'gray' }
}

export function batteryTone(value: number): Tone {
  if (value < 20) return 'red'
  if (value < 30) return 'orange'
  if (value > 80) return 'green'
  return 'blue'
}

export function taskTypeText(type?: string | null): string {
  if (!type) return '运输'
  const map: Record<string, string> = {
    transport: '运输',
    charge: '充电',
    move: '移动',
    task: '运输',
  }
  return map[type] ?? type
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** ISO 字符串 → `2026-11-13 17:20:00`；无法解析时原样美化返回 */
export function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ').replace(/\.\d+/, '').replace(/Z$/, '')
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** ISO 字符串 → `11-13 17:20`，用于紧凑列表 */
export function formatShortTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(5, 16)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

export function formatClock(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatLatency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value)} ms`
}

/** 数字或数字字符串 → number，非法值回退 */
export function toNumber(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}
