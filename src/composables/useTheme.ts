import { computed, ref, watch } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'agv-theme-mode'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readStoredMode(): ThemeMode {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  return 'auto'
}

const mode = ref<ThemeMode>(readStoredMode())
const systemDark = ref(media.matches)

media.addEventListener('change', (event) => {
  systemDark.value = event.matches
})

const resolved = computed<ResolvedTheme>(() => {
  if (mode.value === 'auto') return systemDark.value ? 'dark' : 'light'
  return mode.value
})

function applyTheme(value: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = value
  root.style.colorScheme = value
}

watch(
  resolved,
  (value) => {
    applyTheme(value)
  },
  { immediate: true },
)

watch(mode, (value) => {
  window.localStorage.setItem(STORAGE_KEY, value)
})

export function useTheme() {
  function setMode(next: ThemeMode): void {
    mode.value = next
  }

  return { mode, resolved, setMode }
}
