import { reactive } from 'vue'

export interface ConfirmOptions {
  title?: string
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState extends Required<Omit<ConfirmOptions, 'detail'>> {
  open: boolean
  detail: string
  resolve: ((confirmed: boolean) => void) | null
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '确认操作',
  message: '',
  detail: '',
  confirmLabel: '确认',
  cancelLabel: '取消',
  danger: false,
  resolve: null,
})

function settle(confirmed: boolean): void {
  const resolve = confirmState.resolve
  confirmState.resolve = null
  confirmState.open = false
  resolve?.(confirmed)
}

/** Promise 式确认弹窗：由 App.vue 中的 ConfirmHost 渲染 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // 如果上一个确认还没关闭，视为取消
  if (confirmState.resolve) settle(false)
  confirmState.title = options.title ?? '确认操作'
  confirmState.message = options.message
  confirmState.detail = options.detail ?? ''
  confirmState.confirmLabel = options.confirmLabel ?? '确认'
  confirmState.cancelLabel = options.cancelLabel ?? '取消'
  confirmState.danger = options.danger ?? false
  confirmState.open = true
  return new Promise<boolean>((resolve) => {
    confirmState.resolve = resolve
  })
}

export function resolveConfirm(confirmed: boolean): void {
  settle(confirmed)
}

export function useConfirm() {
  return { confirm: confirmDialog }
}
