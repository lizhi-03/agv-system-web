# AGV 调度前端（Apple 风格 · V2）

AGV 仿真调度系统的 Web 控制台。Vue 3 + TypeScript 从零实现 Apple / macOS HIG 风格的设计系统，**全部数据来自真实后端接口**，无 mock、无假数据。覆盖概览、实时地图、车队、任务、地图编辑、系统日志 6 个页面。

V2 针对"地图太小 / 操作太困难"重做：**地图优先（全屏 + 滚轮缩放 / 拖拽平移 / 全屏）+ 地图直连操作 + 地图选点任务向导 + 车队卡片 + 编辑器拖拽绘制 + 全局快捷键**；数据通道从"每秒双接口"升级为 **SSE 实时推送 → /agv/live 自适应轮询 → /agv/list 兼容降级** 的单通道模型。

## 技术栈

| 类别 | 选择 |
| --- | --- |
| 框架 | Vue 3.5（`<script setup>` + Composition API） |
| 语言 | TypeScript 6（`vue-tsc -b` 严格类型检查） |
| 构建 | Vite 8 |
| 路由 | vue-router 5（History 模式） |
| 请求 | axios（统一响应拆包 + 错误/连接状态收集） |
| 实时通道 | `EventSource('/api/agv/stream')` SSE + `GET /agv/live`（If-None-Match → 304）自适应轮询 + `/agv/list` 降级 |
| UI | **自建轻量组件库**（无 Element Plus / 无第三方 UI、图标、图表库） |
| 图形 | 原生 Canvas 2D（DPR、缩放/平移、hover tooltip、路径/站点/车辆绘制、拖拽绘制） |

图标全部为内联 SVG（`src/components/ui/Icon.vue`），主题支持浅色 / 深色 / 跟随系统。

## 目录结构

```
src/
├── api/                  # 强类型接口层
│   ├── http.ts           # axios 实例、统一响应 {code,msg,data} 拆包、错误提示、连接状态上报
│   ├── status.ts         # 全局后端连接状态（延迟 / 最后成功时间 / 错误）
│   ├── live.ts           # SSE /agv/stream、GET /agv/live（304）、/agv/list 降级、通道状态
│   ├── agv.ts            # /agv/* 接口（含 AgvCode/agvCode 归一化、batch 返回编号、preview）
│   ├── map.ts            # /map/* 共 4 个接口
│   ├── task.ts           # /task/page（taskCode/status/agvCode 服务端筛选）、/task/cancel
│   └── log.ts            # /log/page（level/message 服务端筛选）
├── components/
│   ├── ui/               # 自建设计系统组件（20 个）
│   │   ├── Icon.vue AppButton.vue AppCard.vue StatCard.vue StatusPill.vue
│   │   ├── BatteryBar.vue AppModal.vue AppDrawer.vue AppSegmented.vue
│   │   ├── AppTable.vue AppPagination.vue AppInput.vue AppSelect.vue
│   │   ├── AppNumberField.vue AppSwitch.vue AppSlider.vue AppTooltip.vue
│   │   └── EmptyState.vue SkeletonBlock.vue ToastHost.vue ConfirmHost.vue
│   └── AgvMapCanvas.vue  # Canvas 地图：缩放/平移/双击放大、hover、车辆操作条锚点、拖拽绘制
├── composables/
│   ├── useLiveState.ts   # SSE 优先 + 自适应轮询 + 单通道 + 写后立即拉取 + 地图版本增量刷新
│   ├── useAgvCommand.ts  # 车辆命令 in-flight 去重 + toast + 完成后立即刷新
│   ├── useShortcuts.ts   # g/m/f/t/e/l、? 帮助面板、输入框内不触发
│   ├── usePolling.ts     # 通用轮询：可见性暂停、in-flight 去重、失败退避、卸载清理
│   ├── useToast.ts       # 右上角毛玻璃 toast
│   ├── useConfirm.ts     # Promise 式二次确认弹窗
│   ├── useTheme.ts       # 浅色/深色/自动 + localStorage 持久化
│   └── useBackendStatus.ts
├── styles/
│   ├── tokens.css        # 设计变量：色彩/圆角/阴影/地图配色（light + dark）
│   └── base.css          # reset、表格、表单、骨架屏、动效
├── types/index.ts        # API / 领域类型
├── utils/                # 状态文案/时间格式化、AGV 配色、启停规则（agvRules）
├── views/                # 6 个页面
│   ├── DashboardView.vue # 概览：地图卡 2/3 宽可缩放 + KPI + 任务/日志
│   ├── MapView.vue       # 实时地图：全屏地图 + 缩放/平移/全屏 + 车辆/站点浮动操作条
│   ├── AgvView.vue       # 车队：车辆卡片网格 + 详情抽屉（大号按钮/调速滑杆）
│   ├── TaskView.vue      # 任务：列表（服务端筛选）+ 地图选点向导（≤4 点击）
│   ├── MapEditView.vue   # 编辑：拖拽绘制/画笔/撤销重做/宽高编辑/保存摘要
│   └── LogView.vue       # 日志：服务端级别+关键字筛选
├── router.ts             # 6 路由（/ /map /agv /task /editor /log，/edit 重定向）
├── App.vue               # 毛玻璃侧栏 + sticky 顶栏 + 实时时钟 + 连接/通道卡片 + 快捷键帮助
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

## 页面与接口映射（20 个端点全部有 UI 入口）

| # | 接口 | UI 入口 |
| --- | --- | --- |
| 1 | `POST /agv/list` | 概览/地图实时通道的兼容降级；车队/向导的车辆卡片数据 |
| 2 | `GET /agv/{agvCode}` | 车队卡片 / 地图车辆浮动条「详情」→ 详情抽屉（路径点数、pathIndex、agvPaths 等） |
| 3 | `POST /agv/batch/{n}` | 车队页「批量加车」（1..50，返回 `string[]` 连续新编号，按钮防抖，新车高亮） |
| 4 | `POST /agv/charge/{agvCode}` | 车队抽屉 / 地图车辆浮动条「充电」 |
| 5 | `POST /agv/report` | 车队抽屉「上报位置」→ X/Y 表单，只提交坐标（后端合并语义保留任务/路径） |
| 6 | `POST /agv/path` | 任务向导「确认下发」→ 真实规划并开始任务；成功高亮路径 |
| 7 | `POST /agv/stop` | 车队卡片/抽屉、地图车辆浮动条「暂停」（仅运行中且有任务可点，否则禁用并提示原因） |
| 8 | `POST /agv/start` | 车队卡片/抽屉、地图车辆浮动条「启动」（仅已暂停且有任务可点） |
| 9 | `POST /agv/speed` | 车队抽屉「调速」滑杆（实时值 + 预设）/ 地图车辆浮动条「调速」 |
| 10 | `POST /agv/clear` | 任务页「清空全部任务」（危险操作二次确认） |
| 11 | `GET /map/current` | 首次加载静态地图；仅在 `live.mapVersion` 变化时重新拉取 |
| 12 | `POST /map/save` | 地图编辑「保存前确认」摘要 → 保存后重新 GET /map/current 提示新版本号 |
| 13 | `POST /map/reset` | 地图编辑「重置」（丢弃改动前确认） |
| 14 | `GET /map/station` | 任务向导站点数据（地图点击校验） |
| 15 | `POST /task/page` | 任务页服务端分页 + `taskCode` / `status` / `agvCode` 服务端筛选 + 概览任务总数/状态分布（首页 100 条） |
| 16 | `GET /task/cancel/{taskId}` | 任务页行操作「取消」（已完成/已取消/失败禁用） |
| 17 | `POST /log/page` | 日志页服务端分页 + `level` / `message` 服务端筛选 + 概览最近 6 条日志 |
| 18 | `POST /agv/preview` | 任务向导选完起终点后自动预览（只规划不落库，显示路径点数/距离/预计时间） |
| 19 | `GET /agv/live` | 概览/地图实时通道（SSE 降级时使用，`If-None-Match` → 304 无变化） |
| 20 | `GET /agv/stream` | 概览/地图 SSE 实时推送（`event: state`，单通道优先；`/agv/stream/status` 供排障） |

## 实时数据通道（V2.1）

概览页与实时地图页**不再每秒请求两个接口**，统一走 `useLiveState.ts` 的单通道模型：

| 优先级 | 通道 | 行为 |
| --- | --- | --- |
| 1 | `GET /api/agv/stream`（SSE） | 优先连接；`event: state` 推送变化帧；连接成功后**停掉轮询**；断线指数退避重连 1/2/4s，最多 3 次 |
| 2 | `GET /api/agv/live` | SSE 不可用时轮询；带 `If-None-Match`，304 视为无变化；有运行/充电车 1s、全空闲 5s |
| 3 | `POST /api/agv/list` | 上述都不可用时兼容降级（旧后端） |

- **单通道原则**：SSE 生效即停轮询，降级即停 SSE；任意时刻每页只有一条数据通道。
- **地图静态数据**（尺寸/障碍/站点）首次加载一次，仅 `live.mapVersion` 变化时重新 `GET /map/current`。
- 页面隐藏暂停轮询（SSE 保持连接），恢复可见立即补拉；底部连接卡显示 `实时推送 / 轮询（自适应）/ 轮询（兼容）` 与最后同步时间。
- **写后立即可见**：调速/启停/充电/上报/建任务/清空/加车等成功后主动刷新一次，不等下一帧推送。
- 实测（1440×900，后端 V2.1）：概览/地图空闲 30s 内**新增 `/api` 请求 0 次**（仅 1 条 SSE 长连接；V1 为约 120 请求/分钟/页）。

## 设计系统摘要

- 背景 `#f5f5f7`、表面 `#fff`、主色 `#0071e3`；深色背景 `#000`、表面 `#1c1c1e`，随系统或手动切换并持久化
- 卡片圆角 20px、控件 14px、胶囊按钮；阴影 `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)`
- 侧栏 240px 毛玻璃（`blur(24px) saturate(180%)`），≤1080px 收窄为 76px 图标栏，≤768px 抽屉化
- 字体 `-apple-system / SF Pro / PingFang SC`，数字 `tabular-nums`；尊重 `prefers-reduced-motion`
- 状态：AGV 空闲灰 / 运行绿 / 充电紫 / 暂停橙 / 异常红；任务、日志同色系 tinted 胶囊
- 加载用骨架屏，空态用插画式 SVG + 说明 + 操作，错误态给出后端未连接提示与重试
- 按钮最小高度 36px；禁用态统一灰底 + `grayscale(1)` 明确不可用
- 地图：网格线 + 深灰圆角障碍 + 蓝点站点（白描边、编号）+ 橙色充电站（⚡）+ 按编号取色的圆角车辆（方向指示、编号标签）+ 同色半透明规划路径 + 淡色已占用路径；hover 毛玻璃 tooltip

## V2 操作指南（最少点击）

### 实时地图 `/map`
- **全屏地图优先**：画布占满内容区（1440 下宽 1200 / 内容区 1200 = 100%，高 821px）。
- 缩放：滚轮以鼠标为中心（0.5x–6x）、右上 `- / 百分比 / + / 适应窗口 / 1:1 / 全屏`；双击放大；拖拽平移；空格/右键拖拽也可平移。
- **点车辆** → 底部浮动操作条（启动/暂停/调速/充电/详情），暂停/启动 ≤2 次点击；**点站点** → 设为起点/终点 → 直连任务向导。
- 右上浮层：网格/路径/标签开关与图例；车辆面板可展开/收起；空闲/暂停状态可在信息条暂停实时同步。

### 任务 `/task`
- 「新建任务」进入**地图选点向导**：选车（默认最近空闲车）→ 点起点站点 → 点终点站点 → 自动 `POST /agv/preview` 显示路径点数/距离/预计时间 → 「确认下发」（`POST /agv/path`）。**全流程 3~4 次点击**，成功高亮路径。
- 列表支持服务端筛选：任务编号、状态分段、车辆下拉、pageSize、分页；自动刷新可开关。

### 车队 `/agv`
- 车辆卡片网格：状态/电量/位置/任务一站式；点卡片打开详情抽屉，抽屉内 36px 大按钮（启动/暂停/充电/在地图查看/上报位置/保存速度）+ 实时调速滑杆。
- 批量加车默认 1 辆，返回连续编号并高亮新车（可连续添加，不会重复注册）。

### 地图编辑 `/editor`
- 右侧工具面板：障碍/站点/充电站/擦除（快捷键 `1`–`4`）；画笔 `1×1 / 3×3`；左键拖拽连续绘制/擦除，空格或右键拖拽平移，滚轮缩放。
- `Ctrl+Z` 撤销 / `Ctrl+Shift+Z` 重做；宽高可编辑（10–200，会裁剪越界元素且可撤销）；保存前弹出变更摘要（障碍/站点增删、尺寸、目标版本）。

### 全局快捷键
| 按键 | 功能 |
| --- | --- |
| `g` / `m` / `f` / `t` / `e` / `l` | 概览 / 实时地图 / 车队 / 任务 / 地图编辑 / 日志 |
| `?` | 打开或关闭快捷键帮助面板（右下角 `?` 按钮同效） |
| `Esc` | 关闭弹窗 / 取消地图选中 |

## 已知限制

1. SSE `/agv/stream` 与 `/agv/live` 依赖后端 V2.1；若后端未部署或返回业务错误，前端自动降级 `/agv/live` 轮询 → `/agv/list`，并在连接卡标注"轮询（兼容）"。
2. 实时快照的 `map` 字段只含元信息（版本/尺寸），障碍/站点仍以 `/map/current` 为准，仅版本变化时重新拉取。
3. `/map/save` 返回 `data: null`，保存后需再请求 `/map/current` 获取新版本号（后端会生成新 `mapId` / `version`）。
4. 车辆无 `taskId` 时后端 `/agv/start`、`/agv/stop` 返回业务提示（HTTP 200 / code=204 + msg），前端按状态禁用按钮并展示原因。
5. `/agv/charge` 依赖当前地图存在 `type=charge` 站点，地图无充电站时后端会异常，前端展示后端错误文案。
6. `/agv/report` 后端为合并语义：只提交 `agvCode/x/y` 即可，未提交的 `taskId/plannedPath/pathIndex/description/isCharge` 自动保留；运行中车辆上报安全（也兼容完整快照）。
7. `/agv/batch/{n}`（V2）返回 `data: string[]`：从现有 AGVplus 最大编号 +1 连续生成，n 1..50，非法 n 返回 `code=204 + msg`；新车立即可派任务并会移动。
8. 空闲车辆的速度会被后端模拟器在 1s 内重置为 0，调速请在实际运行中的车辆上进行（UI 已给出提示）。
9. 地图编辑：障碍与站点互斥、同格站点唯一；撤销/重做历史为客户端栈（最多 60 步）；保存沿用当前地图宽高。
10. 后端模拟器语义：运行中车辆「上报」的坐标可能被下一次 tick 按规划路径覆盖（属模拟器行为）；满电车辆发起充电会瞬间完成。
11. 地图底部浮动操作条会暂遮住最下排部分格子，点空白处或关闭按钮即可收起；站点被车辆占据时点击会优先选中车辆（可先移车或缩放/平移后再点站点）。
12. 无鉴权，仅适用于内网演示环境。
