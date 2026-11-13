import axios, { type AxiosRequestConfig } from 'axios'
import type { ApiResult } from '../types'
import { toast } from '../composables/useToast'
import { reportHttpError, reportReachable, reportUnreachable } from './status'

/** 业务/网络错误统一异常，视图层可展示 message */
export class ApiError extends Error {
  readonly code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const baseURL = import.meta.env.VITE_API_BASE || '/api'

export const http = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

function normalizeList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/**
 * 统一请求：拆统一响应 { code, msg, data }。
 * - quiet = true 时不弹 toast（轮询使用），错误仍会抛出交给调用方处理。
 * - 任何 HTTP 响应都会刷新连接状态；网络错误标记为不可达。
 */
export async function request<T>(config: AxiosRequestConfig, quiet = false): Promise<T> {
  const startedAt = performance.now()
  try {
    const response = await http.request<ApiResult<T>>(config)
    reportReachable(performance.now() - startedAt)
    const body = response.data
    if (!body || typeof body.code !== 'number') {
      throw new ApiError('响应格式异常：缺少 code 字段')
    }
    if (body.code === 200) {
      return body.data
    }
    const message =
      body.msg || (body.code === 204 ? '操作未成功，请稍后重试' : `请求失败（code ${body.code}）`)
    throw new ApiError(message, body.code)
  } catch (error) {
    if (error instanceof ApiError) {
      if (!quiet) toast.error(error.message)
      throw error
    }
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const rawData: unknown = error.response?.data
      const body =
        rawData && typeof rawData === 'object'
          ? (rawData as { msg?: string; message?: string; code?: number })
          : null
      let message: string
      if (!error.response) {
        message =
          error.code === 'ECONNABORTED'
            ? '请求超时，后端响应过慢'
            : '无法连接后端服务，请确认 gateway(8080) 与 service-agv(8000) 已启动'
        reportUnreachable(message)
      } else if (status === 502 || status === 503 || status === 504 || typeof rawData === 'string') {
        // 开发代理连不上网关、或网关无可用实例时返回的 HTML/文本错误
        message = `无法连接后端服务（HTTP ${status}），请确认 gateway(8080) 与 service-agv(8000) 已启动`
        reportUnreachable(message)
      } else {
        message = body?.msg || body?.message || `请求失败（HTTP ${status}）`
        reportHttpError(message)
      }
      if (!quiet) toast.error(message)
      throw new ApiError(message, status)
    }
    if (!quiet) toast.error('发生未知错误，请稍后重试')
    throw error instanceof Error ? error : new Error('发生未知错误')
  }
}

/** 列表接口的 data 可能为 null，统一成数组 */
export async function requestList<T>(config: AxiosRequestConfig, quiet = false): Promise<T[]> {
  const data = await request<T[] | null>(config, quiet)
  return normalizeList(data)
}
