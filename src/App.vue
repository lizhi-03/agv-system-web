<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { navItems } from './router'
import Icon from './components/ui/Icon.vue'
import ToastHost from './components/ui/ToastHost.vue'
import ConfirmHost from './components/ui/ConfirmHost.vue'
import { useBackendStatus } from './composables/useBackendStatus'
import { useTheme, type ThemeMode } from './composables/useTheme'
import { formatClock, formatLatency } from './utils/labels'

const route = useRoute()
const { status, checking, retry } = useBackendStatus()
const { mode, setMode } = useTheme()

const drawerOpen = ref(false)
const now = ref(new Date())
const clock = computed(() => formatClock(now.value))
let clockTimer = 0

const title = computed(() => (route.meta.title as string | undefined) ?? 'AGV 调度')
const subtitle = computed(() => (route.meta.subtitle as string | undefined) ?? '')

const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'auto', label: '自动', icon: 'auto' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
]

const connectionState = computed(() => {
  if (!status.checked) return 'pending'
  return status.reachable ? 'online' : 'offline'
})

const connectionTitle = computed(() => {
  if (connectionState.value === 'pending') return '正在连接后端'
  return status.reachable ? '后端已连接' : '后端未连接'
})

const connectionSub = computed(() => {
  if (connectionState.value === 'pending') return 'gateway :8080'
  if (status.reachable) return `延迟 ${formatLatency(status.latency)}`
  return 'gateway :8080 无响应'
})

const lastSyncText = computed(() =>
  status.lastSuccessAt ? formatClock(status.lastSuccessAt) : '—',
)

function isActive(path: string): boolean {
  return route.path === path
}

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
    window.scrollTo({ top: 0 })
  },
)

watch(
  title,
  (value) => {
    document.title = `${value} · AGV 调度`
  },
  { immediate: true },
)

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  window.clearInterval(clockTimer)
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar" :class="{ open: drawerOpen }">
      <div class="brand">
        <span class="brand-mark"><Icon name="agv" :size="20" /></span>
        <span class="brand-text">
          <strong>AGV 调度</strong>
          <small>仿真控制台</small>
        </span>
      </div>

      <nav class="nav" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          :title="item.label"
          :aria-current="isActive(item.path) ? 'page' : undefined"
        >
          <span class="nav-icon"><Icon :name="item.icon" :size="19" /></span>
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <div class="conn-card" :data-state="connectionState">
          <div class="conn-top">
            <span class="conn-dot" />
            <span class="conn-text">
              <strong>{{ connectionTitle }}</strong>
              <small>{{ connectionSub }}</small>
            </span>
            <button
              type="button"
              class="conn-retry"
              :disabled="checking"
              title="重新探测后端连接"
              aria-label="重试连接"
              @click="retry"
            >
              <Icon name="refresh" :size="13" :class="{ spinning: checking }" />
            </button>
          </div>
          <div class="conn-meta">
            <span class="num">最后同步 {{ lastSyncText }}</span>
            <span v-if="!status.reachable && status.lastError" class="conn-error">
              {{ status.lastError }}
            </span>
          </div>
        </div>

        <div class="theme-switch" role="group" aria-label="主题模式">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="theme-btn"
            :class="{ active: mode === option.value }"
            :title="`${option.label}模式`"
            :aria-pressed="mode === option.value"
            @click="setMode(option.value)"
          >
            <Icon :name="option.icon" :size="14" />
            <span class="theme-label">{{ option.label }}</span>
          </button>
        </div>
      </div>
    </aside>

    <div v-if="drawerOpen" class="scrim" @click="drawerOpen = false" />

    <div class="main">
      <header class="topbar">
        <button
          type="button"
          class="icon-btn menu-btn"
          aria-label="打开导航"
          @click="drawerOpen = true"
        >
          <Icon name="menu" :size="18" />
        </button>
        <div class="topbar-title">
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div class="topbar-right">
          <div id="topbar-actions" class="topbar-actions" />
          <span class="clock num">
            <Icon name="clock" :size="14" />
            {{ clock }}
          </span>
        </div>
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>
    </div>

    <ToastHost />
    <ConfirmHost />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

/* ------------------------------ 侧栏 ------------------------------ */

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 100;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 22px 14px 16px;
  background: var(--surface-glass);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-right: 1px solid var(--separator);
  transition: width var(--dur) var(--ease), transform 0.3s var(--ease);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 18px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: linear-gradient(145deg, var(--accent), #5ac8fa);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.28);
  flex: none;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.brand-text strong {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.brand-text small {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 38px;
  padding: 0 11px;
  border-radius: 11px;
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}

.nav-item:hover {
  background: var(--surface-subtle);
  color: var(--text);
}

.nav-item.active {
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: 600;
}

.nav-icon {
  display: inline-flex;
  flex: none;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.conn-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 12px;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  min-width: 0;
}

.conn-top {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex: none;
  box-shadow: 0 0 0 3px rgba(142, 142, 147, 0.16);
}

.conn-card[data-state='online'] .conn-dot {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-tint);
}

.conn-card[data-state='offline'] .conn-dot {
  background: var(--red);
  box-shadow: 0 0 0 3px var(--red-tint);
}

.conn-card[data-state='pending'] .conn-dot {
  background: var(--orange);
  box-shadow: 0 0 0 3px var(--orange-tint);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.conn-text {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
  flex: 1;
}

.conn-text strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-text small {
  font-size: 10.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--text-secondary);
  flex: none;
  transition: background-color var(--dur) var(--ease);
}

.conn-retry:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}

.conn-retry:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.conn-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: var(--text-tertiary);
}

.conn-error {
  color: var(--red-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-switch {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 11px;
  background: var(--control-bg);
}

.theme-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 11.5px;
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}

.theme-btn:hover:not(.active) {
  color: var(--text);
}

.theme-btn.active {
  background: var(--seg-active-bg);
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

/* ------------------------------ 顶栏与内容 ------------------------------ */

.main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
  margin-left: var(--sidebar-w);
  transition: margin-left var(--dur) var(--ease);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: var(--topbar-h);
  padding: 12px 36px;
  background: var(--surface-glass);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid var(--separator);
}

.topbar-title {
  min-width: 0;
  flex: 1;
}

.topbar-title h1 {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.topbar-title p {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.clock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 12.5px;
}

.content {
  flex: 1;
  width: 100%;
  padding: 28px 36px 48px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--text-secondary);
  transition: background-color var(--dur) var(--ease);
}

.icon-btn:hover {
  background: var(--surface-subtle);
  color: var(--text);
}

.menu-btn {
  display: none;
}

.scrim {
  display: none;
}

/* ------------------------------ 响应式 ------------------------------ */

@media (max-width: 1080px) {
  .sidebar {
    width: var(--sidebar-w-rail);
    padding: 22px 10px 16px;
    align-items: center;
  }

  .brand {
    padding: 0 0 18px;
  }

  .brand-text {
    display: none;
  }

  .nav-item {
    width: 48px;
    height: 44px;
    justify-content: center;
    padding: 0;
  }

  .nav-label {
    display: none;
  }

  .sidebar-foot {
    align-items: center;
    width: 100%;
  }

  .conn-card {
    padding: 8px;
    align-items: center;
  }

  .conn-text,
  .conn-meta {
    display: none;
  }

  .conn-top {
    gap: 4px;
    justify-content: center;
  }

  .theme-switch {
    flex-direction: column;
    width: 46px;
  }

  .theme-label {
    display: none;
  }

  .main {
    margin-left: var(--sidebar-w-rail);
  }

  .topbar {
    padding: 12px 24px;
  }

  .content {
    padding: 22px 24px 40px;
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 240px;
    padding: 22px 14px 16px;
    align-items: stretch;
    transform: translateX(-100%);
    box-shadow: var(--shadow-modal);
  }

  .sidebar.open {
    transform: none;
  }

  .brand {
    padding: 0 8px 18px;
  }

  .brand-text {
    display: flex;
  }

  .nav-item {
    width: auto;
    height: 40px;
    justify-content: flex-start;
    padding: 0 11px;
    gap: 11px;
  }

  .nav-label {
    display: inline;
  }

  .sidebar-foot {
    align-items: stretch;
  }

  .conn-card {
    padding: 11px 12px;
    align-items: stretch;
  }

  .conn-text,
  .conn-meta {
    display: flex;
  }

  .conn-top {
    justify-content: flex-start;
  }

  .theme-switch {
    flex-direction: row;
    width: auto;
  }

  .theme-label {
    display: inline;
  }

  .main {
    margin-left: 0;
  }

  .menu-btn {
    display: inline-flex;
  }

  .topbar {
    gap: 10px;
    padding: 12px 18px;
  }

  .topbar-title h1 {
    font-size: 20px;
  }

  .topbar-title p {
    display: none;
  }

  .clock {
    display: none;
  }

  .content {
    padding: 18px 16px 40px;
  }

  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 95;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
}
</style>
