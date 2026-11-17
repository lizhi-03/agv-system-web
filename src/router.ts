import { createRouter, createWebHistory } from 'vue-router'

// 路由级懒加载：每个页面独立 chunk，首屏只下载当前页面的代码
const DashboardView = () => import('./views/DashboardView.vue')
const MapView = () => import('./views/MapView.vue')
const AgvView = () => import('./views/AgvView.vue')
const TaskView = () => import('./views/TaskView.vue')
const MapEditView = () => import('./views/MapEditView.vue')
const LogView = () => import('./views/LogView.vue')

export interface NavItem {
  path: string
  label: string
  icon: string
}

export const navItems: NavItem[] = [
  { path: '/', label: '概览', icon: 'dashboard' },
  { path: '/map', label: '实时地图', icon: 'map' },
  { path: '/agv', label: '车队', icon: 'agv' },
  { path: '/task', label: '任务', icon: 'task' },
  { path: '/editor', label: '地图编辑', icon: 'editor' },
  { path: '/log', label: '系统日志', icon: 'log' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { title: '概览', subtitle: '车辆、任务与地图运行态势一览' },
    },
    {
      path: '/map',
      name: 'map',
      component: MapView,
      meta: { title: '实时地图', subtitle: '地图优先 · 滚轮缩放 / 拖拽平移 / 点击车辆直接操作', flush: true },
    },
    {
      path: '/agv',
      name: 'agv',
      component: AgvView,
      meta: { title: '车队', subtitle: '车辆状态、调度指令与位置上报' },
    },
    {
      path: '/task',
      name: 'task',
      component: TaskView,
      meta: { title: '任务', subtitle: '任务分页、创建运输任务与取消' },
    },
    {
      path: '/editor',
      name: 'editor',
      component: MapEditView,
      meta: { title: '地图编辑', subtitle: '拖拽绘制 · 缩放平移 · 撤销重做 · 保存新版本', flush: true },
    },
    {
      path: '/log',
      name: 'log',
      component: LogView,
      meta: { title: '系统日志', subtitle: '服务端日志分页与当前页筛选' },
    },
    { path: '/edit', redirect: '/editor' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
