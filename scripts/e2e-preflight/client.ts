import type { PreflightReport } from './types'
import { readFile } from 'node:fs/promises'

export async function readReport(file: string): Promise<PreflightReport> {
  const report = JSON.parse(await readFile(file, 'utf8'))
  if (report.schema !== 'full-test-preflight/v1' || typeof report.token !== 'string' || !report.token
    || typeof report.endpoint !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(report.endpoint)) {
    throw new Error('预检报告无效；必须使用 prepare 生成的本轮报告。')
  }
  return report
}

export async function request<T>(report: PreflightReport, operation: string, body: unknown): Promise<T> {
  const response = await fetch(`${report.endpoint}/${operation}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${report.token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(operation === 'verify' ? 900_000 : operation === 'block' ? 5000 : 360_000),
  })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) {
    throw new Error(result.error ?? '预检会话请求失败。')
  }
  return result
}
