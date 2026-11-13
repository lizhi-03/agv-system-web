import { request, requestList } from './http'
import type {
  AgvCodePayload,
  AgvPathPoint,
  AgvSnapshot,
  CreateTaskPayload,
  PathNode,
  ReportAgvPayload,
  SpeedPayload,
} from '../types'
import { toNumber } from '../utils/labels'

/** 后端实体字段名为 AgvCode（getter getAgvCode），JSON key 通常为 agvCode；这里做兼容归一化 */
type RawAgv = Partial<Omit<AgvSnapshot, 'plannedPath' | 'agvPaths' | 'pathIndex'>> & {
  AgvCode?: string
  agv_code?: string
  plannedPath?: PathNode[] | null
  pathIndex?: number | null
  agvPaths?: AgvPathPoint[] | null
}

function normalizeNodes(raw: unknown): PathNode[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const node = (item ?? {}) as Partial<PathNode>
    return {
      x: toNumber(node.x),
      y: toNumber(node.y),
      direction: node.direction == null ? null : toNumber(node.direction),
    }
  })
}

function normalizeAgvPaths(raw: unknown): AgvPathPoint[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const point = (item ?? {}) as Partial<AgvPathPoint>
    return {
      x: toNumber(point.x),
      y: toNumber(point.y),
      agvCode: point.agvCode,
      pathId: point.pathId,
      mapId: point.mapId,
      type: point.type,
    }
  })
}

function normalizeAgv(raw: RawAgv | null | undefined): AgvSnapshot {
  const source = raw ?? {}
  return {
    agvCode: String(source.agvCode ?? source.AgvCode ?? source.agv_code ?? ''),
    x: toNumber(source.x),
    y: toNumber(source.y),
    direction: toNumber(source.direction),
    status: source.status ?? 'idle',
    battery: toNumber(source.battery),
    speed: toNumber(source.speed),
    taskId: source.taskId == null ? null : toNumber(source.taskId),
    plannedPath: normalizeNodes(source.plannedPath),
    pathIndex: toNumber(source.pathIndex),
    agvPaths: normalizeAgvPaths(source.agvPaths),
    description: source.description ?? null,
    isCharge: toNumber(source.isCharge),
    lastUpdate: source.lastUpdate ?? null,
  }
}

/** 全部车辆状态（POST /agv/list，无 body） */
export function listAgv(quiet = false): Promise<AgvSnapshot[]> {
  return requestList<RawAgv>({ url: '/agv/list', method: 'post' }, quiet).then((list) =>
    list.map(normalizeAgv),
  )
}

/** 单车快照（GET /agv/{agvCode}） */
export function getAgv(agvCode: string, quiet = false): Promise<AgvSnapshot | null> {
  return request<RawAgv | null>(
    { url: `/agv/${encodeURIComponent(agvCode)}`, method: 'get' },
    quiet,
  ).then((raw) => (raw ? normalizeAgv(raw) : null))
}

/** 动态加车：固定生成 AGVplus0001..AGVplus{n}（1..20） */
export function batchAgv(count: number): Promise<null> {
  return request<null>({ url: `/agv/batch/${count}`, method: 'post' })
}

/** 前往最近充电站 */
export function chargeAgv(agvCode: string): Promise<null> {
  return request<null>({ url: `/agv/charge/${encodeURIComponent(agvCode)}`, method: 'post' })
}

/** 位置上报：必须回传完整快照，否则后端会无条件覆盖 taskId / plannedPath */
export function reportAgv(payload: ReportAgvPayload): Promise<null> {
  return request<null>({ url: '/agv/report', method: 'post', data: payload })
}

/** 创建并开始任务（POST /agv/path），返回规划路径节点 */
export function createPathTask(payload: CreateTaskPayload): Promise<PathNode[]> {
  return request<PathNode[] | null>({ url: '/agv/path', method: 'post', data: payload }, false).then(
    (nodes) => normalizeNodes(nodes),
  )
}

/** 暂停（车辆无 taskId 时后端会 500，调用方需先禁用） */
export function stopAgv(payload: AgvCodePayload): Promise<null> {
  return request<null>({ url: '/agv/stop', method: 'post', data: payload })
}

/** 恢复（车辆无 taskId 时后端会 500，调用方需先禁用） */
export function startAgv(payload: AgvCodePayload): Promise<null> {
  return request<null>({ url: '/agv/start', method: 'post', data: payload })
}

/** 调速 0..1000 cm/s */
export function setSpeed(payload: SpeedPayload): Promise<null> {
  return request<null>({ url: '/agv/speed', method: 'post', data: payload })
}

/** 取消全部车辆任务（危险操作，调用方需二次确认） */
export function clearAllTasks(): Promise<null> {
  return request<null>({ url: '/agv/clear', method: 'post' })
}
