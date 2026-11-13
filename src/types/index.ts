/** 统一响应包装：code === 200 为成功；code === 204 为业务失败（读 msg） */
export interface ApiResult<T> {
  code: number
  msg: string | null
  data: T
}

export interface PageResult<T> {
  total: number
  records: T[]
}

export interface Point {
  x: number
  y: number
}

export interface Obstacle extends Point {}

export interface Station extends Point {
  id: string
  type: string
}

export interface AgvPathPoint extends Point {
  pathId?: number
  agvCode?: string
  type?: string
  mapId?: number
}

export interface PathNode extends Point {
  direction?: number | null
}

export interface AgvMap {
  mapId?: number
  mapCode?: string
  mapName?: string
  width: number
  height: number
  cellSize?: number
  description?: string | null
  obstacles: Obstacle[]
  stations: Station[]
  paths: AgvPathPoint[]
  version?: number
  isCurrent?: number
  parentId?: number | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface AgvSnapshot {
  agvCode: string
  x: number
  y: number
  direction: number
  status: string
  battery: number
  speed: number
  taskId: number | null
  plannedPath: PathNode[]
  pathIndex: number
  agvPaths: AgvPathPoint[]
  description: string | null
  isCharge: number
  lastUpdate?: string | null
}

export interface AgvTask {
  taskId: number
  taskCode: string
  agvCode: string
  taskType?: string | null
  status?: string | null
  priority?: string | null
  source?: string | null
  destination?: string | null
  startTime?: string | null
  estimatedEndTime?: string | null
  actualEndTime?: string | null
  description?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  startPointX?: number | null
  startPointY?: number | null
  passMidPoint?: number | null
}

export interface AgvLog {
  logId: number
  timestamp?: string | null
  level?: string | null
  message?: string | null
  createdAt?: string | null
}

export interface TaskQuery {
  page: number
  pageSize: number
  taskCode?: string
  /** V2 服务端过滤 */
  status?: string
  agvCode?: string
}

export interface LogQuery {
  page: number
  pageSize: number
  /** V2 服务端过滤 */
  level?: string
  message?: string
}

export interface TaskPointRequest {
  id?: string
  stationId?: string
  x: number
  y: number
}

export interface CreateTaskPayload {
  agvCode: string
  taskCode: string
  startPoint: TaskPointRequest
  endPoint: TaskPointRequest
  currentPoint: TaskPointRequest
}

/** 位置上报必须回传完整快照，否则后端会清空任务字段 */
export interface ReportAgvPayload {
  agvCode: string
  x: number
  y: number
  direction?: number
  status?: string
  battery?: number
  speed?: number
  taskId?: number | null
  plannedPath?: PathNode[] | null
  pathIndex?: number
  agvPaths?: AgvPathPoint[]
  description?: string | null
  isCharge?: number
  lastUpdate?: string | null
}

export interface SpeedPayload {
  agvCode: string
  speed: number
}

export interface AgvCodePayload {
  agvCode: string
}
