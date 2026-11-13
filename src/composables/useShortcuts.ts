import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

export interface ShortcutItem {
  keys: string
  label: string
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: 'g', label: '概览' },
  { keys: 'm', label: '实时地图' },
  { keys: 'f', label: '车队' },
  { keys: 't', label: '任务' },
  { keys: 'e', label: '地图编辑' },
  { keys: 'l', label: '系统日志' },
  { keys: '?', label: '打开 / 关闭快捷键帮助' },
  { keys: 'Esc', label: '关闭弹窗 / 取消地图选中' },
]

const KEY_TO_PATH: Record<string, string> = {
  g: '/',
  m: '/map',
  f: '/agv',
  t: '/task',
  e: '/editor',
  l: '/log',
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

/** 全局快捷键：g/m/f/t/e/l 切页，? 打开帮助，Esc 由各弹窗/页面自行处理 */
export function useShortcuts() {
  const router = useRouter()
  const helpOpen = ref(false)

  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isTypingTarget(event.target)) return

    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      event.preventDefault()
      helpOpen.value = !helpOpen.value
      return
    }
    const path = KEY_TO_PATH[event.key.toLowerCase()]
    if (path) {
      event.preventDefault()
      void router.push(path)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })

  return { helpOpen, shortcuts: SHORTCUTS }
}
