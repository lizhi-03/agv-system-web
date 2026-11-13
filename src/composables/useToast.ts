import { reactive } from 'vue'

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  message?: string
}

export const toastState = reactive<{ items: ToastItem[] }>({ items: [] })

let seed = 0
const timers = new Map<number, number>()

export function dismissToast(id: number): void {
  const index = toastState.items.findIndex((item) => item.id === id)
  if (index >= 0) toastState.items.splice(index, 1)
  const timer = timers.get(id)
  if (timer) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
}

export function pushToast(tone: ToastTone, title: string, message?: string, duration = 3600): number {
  const id = ++seed
  toastState.items.push({ id, tone, title, message })
  if (toastState.items.length > 4) {
    dismissToast(toastState.items[0].id)
  }
  if (duration > 0) {
    timers.set(
      id,
      window.setTimeout(() => dismissToast(id), duration),
    )
  }
  return id
}

export const toast = {
  success: (title: string, message?: string) => pushToast('success', title, message),
  error: (title: string, message?: string) => pushToast('error', title, message, 4600),
  warning: (title: string, message?: string) => pushToast('warning', title, message, 4200),
  info: (title: string, message?: string) => pushToast('info', title, message),
  show: pushToast,
  dismiss: dismissToast,
}

export function useToast() {
  return { items: toastState.items, toast, dismiss: dismissToast }
}
