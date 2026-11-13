# AGV 调度前端（Apple 风格）

AGV 仿真调度系统的 Web 控制台。Vue 3 + TypeScript 从零实现 Apple / macOS HIG 风格的设计系统，**全部数据来自真实后端接口**，无 mock、无假数据。覆盖概览、实时地图、车队、任务、地图编辑、系统日志 6 个页面。

## 技术栈

| 类别 | 选择 |
| --- | --- |
| 框架 | Vue 3.5（`<script setup>` + Composition API） |
| 语言 | TypeScript 6（`vue-tsc -b` 严格类型检查） |
| 构建 | Vite 8 |
| 路由 | vue-router 5（History 模式） |
| 请求 | axios（统一响应拆包 + 错误/连接状态收集） |
| UI | **自建轻量组件库**（无 Element Plus / 无第三方 UI、图标、图表库） |
| 图形 | 原生 Canvas 2D（DPR 适配、hover tooltip、路径/站点/车辆绘制） |

图标全部为内联 SVG（`src/components/ui/Icon.vue`），主题支持浅色 / 深色 / 跟随系统。

## 目录结构

```
src/
├── api/                  # 强类型接口层
│   ├── http.ts           # axios 实例、统一响应 {code,msg,data} 拆包、错误提示、连接状态上报
│   ├── status.ts         # 全局后端连接状态（延迟 / 最后成功时间 / 错误）
│   ├── agv.ts            # /agv/* 共 10 个接口（含 AgvCode/agvCode 归一化）
│   ├── map.ts            # /map/* 共 4 个接口
│   ├── task.ts           # /task/page、/task/cancel
│   └── log.ts            # /log/page
├── components/
│   ├── ui/               # 自建设计系统组件
│   │   ├── Icon.vue AppButton.vue AppCard.vue StatCard.vue StatusPill.vue
│   │   ├── BatteryBar.vue AppModal.vue AppDrawer.vue AppSegmented.vue
│   │   ├── AppTable.vue AppPagination.vue AppInput.vue AppSelect.vue
│   │   ├── AppNumberField.vue AppSwitch.vue AppSlider.vue
│   │   └── EmptyState.vue SkeletonBlock.vue ToastHost.vue ConfirmHost.vue
│   └── AgvMapCanvas.vue  # Canvas 地图：网格/障碍/站点/充电站/车辆/规划路径/已占用路径/hover
├── composables/
│   ├── usePolling.ts     # 轮询：可见性暂停、in-flight 去重、失败退避、卸载清理
│   ├── useToast.ts       # 右上角毛玻璃 toast
│   ├── useConfirm.ts     # Promise 式二次确认弹窗
│   ├── useTheme.ts       # 浅色/深色/自动 + localStorage 持久化
│   └── useBackendStatus.ts
├── styles/
│   ├── tokens.css        # 设计变量：色彩/圆角/阴影/地图配色（light + dark）
│   └── base.css          # reset、表格、表单、骨架屏、tooltip、动效
├── types/index.ts        # API / 领域类型
├── utils/                # 状态文案、时间格式化、AGV 配色
├── views/                # 6 个页面
│   ├── DashboardView.vue MapView.vue AgvView.vue
│   ├── TaskView.vue      MapEditView.vue LogView.vue
├── router.ts             # 6 路由（/ /map /agv /task /editor /log，/edit 重定向）
├── App.vue               # 毛玻璃侧栏 + sticky 顶栏 + 实时时钟 + 连接状态卡片
└── main.ts
```

## 启动

### 1. 后端（真实数据来源）

后端为 Spring Cloud 工程，前端只依赖网关暴露的 **`http://localhost:8080/api`**：

- 网关（gateway）监听 `8080`，由它把 `/api/**` 转发到内部业务服务（内部服务端口属于实现细节，以实际部署为准；本机验证时业务服务运行在 18000，由网关内部转发，前端不感知也不直连）。
- 数据库需初始化 `agv_system` 库及 5 张表，并写入一份 `is_current=1` 的种子地图（含 obstacles / stations，建议包含 `type=charge` 充电站），否则 `/map/current` 返回空、`/agv/path` 与 `/agv/charge` 会失败。

### 2. 前端

```bash
cd D:\VSCode\agv-system
npm install
npm run dev        # http://localhost:5173
```

开发环境 `vite.config.ts` 已配置代理：`/api` → `http://localhost:8080`。

### 3. 生产构建

```bash
npm run build      # vue-tsc -b && vite build，产物在 dist/
npm run preview
```

生产环境 API baseURL 为相对路径 `/api`（同源反向代理到网关即可），也可用环境变量覆盖：

```bash
VITE_API_BASE=https://example.com/api npm run build
```

## 页面与接口映射（17 个端点全部有 UI 入口）

| # | 接口 | UI 入口 |
| --- | --- | --- |
| 1 | `POST /agv/list` | 概览 / 实时地图 / 车队轮询；新建任务弹窗车辆下拉 |
| 2 | `GET /agv/{agvCode}` | 车队页点击表格行 → 车辆详情抽屉（路径点数、pathIndex、agvPaths 等） |
| 3 | `POST /agv/batch/{n}` | 车队页工具栏「批量加车」（1..20，二次确认 + 按钮防抖，提示编号规则与 batch 车 idle 行为） |
| 4 | `POST /agv/charge/{agvCode}` | 车队页行操作「充电」 |
| 5 | `POST /agv/report` | 车队页行操作「上报」→ X/Y 表单，只提交坐标（后端合并语义保留任务/路径；也兼容完整快照） |
| 6 | `POST /agv/path` | 任务页「新建任务」→ 车辆 + 起点 + 终点，展示 当前位→起点→终点 预览 |
| 7 | `POST /agv/stop` | 车队页行操作「暂停」（仅运行中且有任务可点，否则禁用并提示原因） |
| 8 | `POST /agv/start` | 车队页行操作「启动」（仅已暂停且有任务可点，否则禁用并提示原因） |
| 9 | `POST /agv/speed` | 车队页行操作「调速」→ 滑块 + 预设 50/100/150/200/300 |
| 10 | `POST /agv/clear` | 任务页「清空全部任务」（危险操作二次确认） |
| 11 | `GET /map/current` | 概览小地图、实时地图、地图编辑加载 |
| 12 | `POST /map/save` | 地图编辑「保存新版本」→ 保存后重新 GET /map/current 提示新版本号 |
| 13 | `POST /map/reset` | 地图编辑「重置」（丢弃改动前确认） |
| 14 | `GET /map/station` | 新建任务弹窗的起点/终点站点下拉 |
| 15 | `POST /task/page` | 任务页服务端分页 + 概览任务总数/状态分布（首页 100 条统计） |
| 16 | `GET /task/cancel/{taskId}` | 任务页行操作「取消」（已完成/已取消/失败禁用） |
| 17 | `POST /log/page` | 日志页分页 + 概览最近 6 条日志 |

### 轮询策略

| 页面 | 接口 | 间隔 | 说明 |
| --- | --- | --- | --- |
| 概览 | 地图 + 车辆 | 1000ms | 任务/日志 5000ms |
| 实时地图 | 地图 + 车辆 | 1000ms | 可暂停/继续 |
| 车队 | /agv/list | 2000ms | 可关闭自动刷新 |
| 任务 | /task/page | 3000ms | 默认手动，可开启 |
| 地图编辑 | /agv/list（只读车辆） | 3000ms | 地图本身不轮询，避免覆盖草稿 |
| 日志 | /log/page | 3000ms | 默认手动，可开启 |

所有轮询：上一次未返回不发下一次、页面隐藏（`document.visibilityState`）暂停、连续失败指数退避、组件卸载清理。

## 设计系统摘要

- 背景 `#f5f5f7`、表面 `#fff`、主色 `#0071e3`；深色背景 `#000`、表面 `#1c1c1e`，随系统或手动切换并持久化
- 卡片圆角 20px、控件 14px、胶囊按钮；阴影 `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)`
- 侧栏 240px 毛玻璃（`blur(24px) saturate(180%)`），≤1080px 收窄为 76px 图标栏，≤768px 抽屉化
- 字体 `-apple-system / SF Pro / PingFang SC`，数字 `tabular-nums`；尊重 `prefers-reduced-motion`
- 状态：AGV 空闲灰 / 运行绿 / 充电紫 / 暂停橙 / 异常红；任务、日志同色系 tinted 胶囊
- 加载用骨架屏，空态用插画式 SVG + 说明 + 操作，错误态给出后端未连接提示与重试
- 地图：网格线 + 深灰圆角障碍 + 蓝点站点（白描边、编号）+ 橙色充电站（⚡）+ 按编号取色的圆角车辆（方向指示、编号标签）+ 同色半透明规划路径 + 淡色已占用路径；hover 车辆显示毛玻璃 tooltip

## 已知限制

1. 后端 `/task/page` 仅支持 `taskCode` 模糊过滤，无状态/时间过滤；概览的任务状态分布基于首页 100 条样本（README 与 UI 均已标注）。
2. 后端 `/log/page` 无过滤参数，日志页的级别/关键字筛选仅作用于当前页数据。
3. `/map/save` 返回 `data: null`，保存后需再请求 `/map/current` 获取新版本号（后端会生成新 `mapId` / `version`）。
4. 车辆无 `taskId` 时后端 `/agv/start`、`/agv/stop` 返回业务提示（HTTP 200 / code=204 + msg），前端按状态禁用按钮并展示原因。
5. `/agv/charge` 依赖当前地图存在 `type=charge` 站点，地图无充电站时后端会异常，前端展示后端错误文案。
6. `/agv/report` 后端为合并语义：只提交 `agvCode/x/y` 即可，未提交的 `taskId/plannedPath/pathIndex/description/isCharge` 自动保留；前端按此实现，运行中车辆上报安全（接口也兼容完整快照）。
7. `/agv/batch/{n}` 每次调用固定从 `AGVplus0001` 开始生成编号，重复调用会产生重复编号车辆；当已有 `AGVplus0001..0003` 时，需一次添加 ≥4 辆才会出现新编号 `AGVplus0004`。batch 新车会被内存模拟器持续写回 idle@(0,0)，暂不能稳定执行任务（UI 已提示，不引导派任务）。
8. 空闲车辆的速度会被后端模拟器在 1s 内重置为 0，调速请在实际运行中的车辆上进行（UI 已给出提示）。
9. 地图编辑保存沿用当前地图宽高（不提供尺寸修改）；障碍与站点互斥、同格站点唯一；撤销历史为客户端栈（最多 30 步）。
10. 后端模拟器语义：运行中车辆「上报」的坐标可能被下一次 tick 按规划路径覆盖（属模拟器行为）；满电车辆发起充电会瞬间完成；batch 新车的 idle@(0,0) 回写见第 7 条。
11. 无鉴权，仅适用于内网演示环境。
