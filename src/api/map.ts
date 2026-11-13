import { request, requestList } from './http'
import type { AgvMap, AgvPathPoint, Obstacle, Station } from '../types'
import { toNumber } from '../utils/labels'

type RawMap = Partial<Omit<AgvMap, 'obstacles' | 'stations' | 'paths'>> & {
  obstacles?: Obstacle[] | null
  stations?: Station[] | null
  paths?: AgvPathPoint[] | null
}

function normalizeStation(raw: Partial<Station> | null | undefined): Station {
  const source = raw ?? {}
  return {
    id: String(source.id ?? ''),
    type: String(source.type ?? 'station'),
    x: toNumber(source.x),
    y: toNumber(source.y),
  }
}

export function normalizeMap(raw: RawMap | null | undefined): AgvMap | null {
  if (!raw) return null
  return {
    mapId: raw.mapId == null ? undefined : toNumber(raw.mapId),
    mapCode: raw.mapCode,
    mapName: raw.mapName,
    width: toNumber(raw.width),
    height: toNumber(raw.height),
    cellSize: raw.cellSize == null ? undefined : toNumber(raw.cellSize),
    description: raw.description ?? null,
    obstacles: (raw.obstacles ?? []).map((item) => ({
      x: toNumber(item?.x),
      y: toNumber(item?.y),
    })),
    stations: (raw.stations ?? []).map(normalizeStation),
    paths: (raw.paths ?? []).map((item) => ({
      x: toNumber(item?.x),
      y: toNumber(item?.y),
      agvCode: item?.agvCode,
      pathId: item?.pathId == null ? undefined : toNumber(item.pathId),
      mapId: item?.mapId == null ? undefined : toNumber(item.mapId),
      type: item?.type,
    })),
    version: raw.version == null ? 1 : toNumber(raw.version),
    isCurrent: raw.isCurrent == null ? 1 : toNumber(raw.isCurrent),
    parentId: raw.parentId == null ? null : toNumber(raw.parentId),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  }
}

/** 当前地图（可能为空或后端 500） */
export function getCurrentMap(quiet = false): Promise<AgvMap | null> {
  return request<RawMap | null>({ url: '/map/current', method: 'get' }, quiet).then(normalizeMap)
}

/** 保存地图全量，后端生成新版本，返回 data 为 null */
export function saveMap(map: AgvMap): Promise<null> {
  return request<null>({ url: '/map/save', method: 'post', data: map })
}

/** 重置/重新读取当前地图 */
export function resetMap(): Promise<AgvMap | null> {
  return request<RawMap | null>({ url: '/map/reset', method: 'post' }).then(normalizeMap)
}

/** 当前站点列表（GET /map/station） */
export function getStations(quiet = false): Promise<Station[]> {
  return requestList<Station>({ url: '/map/station', method: 'get' }, quiet).then((list) =>
    list.map(normalizeStation),
  )
}
