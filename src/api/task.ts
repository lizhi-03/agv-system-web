import { request } from './http'
import type { AgvTask, PageResult, TaskQuery } from '../types'
import { toNumber } from '../utils/labels'

function normalizeTask(raw: Partial<AgvTask> | null | undefined): AgvTask {
  const source = raw ?? {}
  return {
    taskId: toNumber(source.taskId),
    taskCode: String(source.taskCode ?? ''),
    agvCode: String(source.agvCode ?? ''),
    taskType: source.taskType ?? null,
    status: source.status ?? null,
    priority: source.priority ?? null,
    source: source.source ?? null,
    destination: source.destination ?? null,
    startTime: source.startTime ?? null,
    estimatedEndTime: source.estimatedEndTime ?? null,
    actualEndTime: source.actualEndTime ?? null,
    description: source.description ?? null,
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
    startPointX: source.startPointX == null ? null : toNumber(source.startPointX),
    startPointY: source.startPointY == null ? null : toNumber(source.startPointY),
    passMidPoint: source.passMidPoint == null ? null : toNumber(source.passMidPoint),
  }
}

/** 服务端分页（page 从 1 开始，仅支持 taskCode 模糊过滤） */
export function pageTasks(query: TaskQuery, quiet = false): Promise<PageResult<AgvTask>> {
  const data: Record<string, unknown> = {
    page: query.page,
    pageSize: query.pageSize,
  }
  if (query.taskCode) data.taskCode = query.taskCode
  if (query.status) data.status = query.status
  if (query.agvCode) data.agvCode = query.agvCode
  return request<PageResult<AgvTask> | null>(
    { url: '/task/page', method: 'post', data },
    quiet,
  ).then((page) => ({
    total: toNumber(page?.total),
    records: (page?.records ?? []).map(normalizeTask),
  }))
}

/** 取消任务（GET /task/cancel/{taskId}） */
export function cancelTask(taskId: number): Promise<null> {
  return request<null>({ url: `/task/cancel/${taskId}`, method: 'get' })
}
