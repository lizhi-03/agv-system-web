import { request } from './http'
import type { AgvLog, LogQuery, PageResult } from '../types'
import { toNumber } from '../utils/labels'

function normalizeLog(raw: Partial<AgvLog> | null | undefined): AgvLog {
  const source = raw ?? {}
  return {
    logId: toNumber(source.logId),
    timestamp: source.timestamp ?? null,
    level: source.level ?? 'info',
    message: source.message ?? '',
    createdAt: source.createdAt ?? null,
  }
}

/** 服务端分页，无过滤参数；级别/关键字由页面在当前页内过滤 */
export function pageLogs(query: LogQuery, quiet = false): Promise<PageResult<AgvLog>> {
  return request<PageResult<AgvLog> | null>(
    { url: '/log/page', method: 'post', data: query },
    quiet,
  ).then((page) => ({
    total: toNumber(page?.total),
    records: (page?.records ?? []).map(normalizeLog),
  }))
}
