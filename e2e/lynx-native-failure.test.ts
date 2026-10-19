import { afterEach, expect, it, vi } from 'vitest'
import { formatNativeFailure } from './lynx/native-artifacts'
import { LynxHarnessBlockedError, parseLynxHarnessFailure } from './lynx/native-failure'
import { waitForReportOrFailure } from './lynx/native-report'

afterEach(() => vi.useRealTimers())

function failure(message: string) {
  return JSON.stringify({ runId: 'run', message })
}

it.each(['bridge-unavailable', 'geometry-unavailable', 'view-expired', 'receipt-timeout'])('原生明确%s通过failure文件阻断调度', async (code) => {
  const message = JSON.stringify({ version: 1, source: 'lynx-native-evidence', category: 'environment', code, message: `native ${code}` })
  await expect(waitForReportOrFailure(async () => undefined, async () => failure(message))).rejects.toMatchObject({
    name: 'LynxHarnessBlockedError',
    code: 'LYNX_NATIVE_HARNESS_BLOCKED',
    reason: code,
  })
})

it.each(['Missing native geometry node: probe-sizing-fixed', 'geometry oracle width: expected 64 received 0'])('真实产品失败保持普通错误：%s', async (message) => {
  const error = await waitForReportOrFailure(async () => undefined, async () => failure(message)).catch(error => error as Error)
  expect(error).toBeInstanceOf(Error)
  expect(error).not.toHaveProperty('code')
})

it('原生报告一直无回执时明确阻断，不能生成能力失败报告', async () => {
  vi.useFakeTimers()
  const pending = waitForReportOrFailure(async () => undefined, async () => undefined).catch(error => error as Error)
  await vi.advanceTimersByTimeAsync(300_001)
  expect(await pending).toMatchObject({ name: 'LynxHarnessBlockedError', code: 'LYNX_NATIVE_HARNESS_BLOCKED', reason: 'report-timeout' })
})

it('结构化中断经过聚合清理异常与CLI仍可精确恢复类别', () => {
  const error = new AggregateError([
    new Error('cleanup failure'),
    new Error('wrapper', { cause: new LynxHarnessBlockedError('view-expired', 'View binding expired') }),
  ], 'native run and cleanup failed')
  expect(parseLynxHarnessFailure(`pnpm task output\n${formatNativeFailure(error)}\n`)).toBe('View binding expired')
  expect(parseLynxHarnessFailure(formatNativeFailure(new Error('Missing native geometry node: probe-sizing-fixed')))).toBeUndefined()
})

it.each(['code', 'source', 'category', 'version', 'message'] as const)('failure错误的%s不能将产品失败提升为环境阻塞', async (field) => {
  const payload = { version: 1, source: 'lynx-native-evidence', category: 'environment', code: 'view-expired', message: 'expired' }
  Object.assign(payload, { [field]: field === 'version' ? 2 : field === 'message' ? '' : 'unknown' })
  const error = await waitForReportOrFailure(async () => undefined, async () => failure(JSON.stringify(payload))).catch(error => error as Error)
  expect(error).not.toHaveProperty('code')
})

it.each(['reason', 'source', 'category', 'version', 'code', 'message'] as const)('子进程错误的%s结构标记不阻断', (field) => {
  const payload = { version: 1, source: 'lynx-native-runner', category: 'environment', code: 'LYNX_NATIVE_HARNESS_BLOCKED', reason: 'view-expired', message: 'expired' }
  Object.assign(payload, { [field]: field === 'version' ? 2 : field === 'message' ? '' : 'unknown' })
  expect(parseLynxHarnessFailure(`LYNX_NATIVE_HARNESS_FAILURE ${JSON.stringify(payload)}`)).toBeUndefined()
})

it('相似文本、未加帧的JSON及截断帧均不能提升产品失败', () => {
  const output = formatNativeFailure(new LynxHarnessBlockedError('view-expired', 'View binding expired'))
  for (const value of ['Missing native geometry', 'View binding expired', 'LYNX_NATIVE_HARNESS_FAILURE {', output.split('\n').slice(1).join('\n')]) {
    expect(parseLynxHarnessFailure(value)).toBeUndefined()
  }
})
