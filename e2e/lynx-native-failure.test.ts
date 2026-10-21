import { afterEach, expect, it, vi } from 'vitest'
import { NativeOperationError, nativeReportFailureMessage } from '../examples/react-lynx/src/compatibility/native-error-diagnostics'
import { NativeEvidenceUnavailableError } from '../examples/react-lynx/src/compatibility/native-failure'
import { formatNativeFailure } from './lynx/native-artifacts'
import { LynxHarnessBlockedError, parseLynxHarnessFailure } from './lynx/native-failure'
import { waitForReportOrFailure } from './lynx/native-report'

it('最终工件保留校验过的操作上下文与两条错误链，排除任意宿主字段', async () => {
  const original = new NativeOperationError({ phase: 'dark', operation: 'capture', runId: 'run', requestId: 'request', node: 'probe', artifact: 'probe.png' }, new Error('capture failed'))
  Object.assign(original, { env: { SECRET: 'hidden' }, headers: { Authorization: 'hidden' } })
  const message = nativeReportFailureMessage(new AggregateError([original, new Error('restore failed', { cause: new Error('restore cause') })], 'both failed'))
  const error = await waitForReportOrFailure(async () => undefined, async () => failure(message)).catch(error => error as Error)
  const artifact = JSON.parse(formatNativeFailure(error))
  expect(artifact.cause.errors).toMatchObject([
    { diagnostics: { context: { phase: 'dark', operation: 'capture', requestId: 'request', node: 'probe', artifact: 'probe.png' } }, cause: { message: 'capture failed' } },
    { message: 'restore failed', cause: { message: 'restore cause' } },
  ])
  expect(JSON.stringify(artifact)).not.toMatch(/hidden|Authorization|SECRET/)
  expect(error).not.toHaveProperty('code')
})

it('明确环境错误增加诊断后保留原类别，产品兄弟错误仍进入最终工件', async () => {
  const message = nativeReportFailureMessage(new AggregateError([new Error('product failed'), new NativeEvidenceUnavailableError('view-expired', 'expired')], 'both failed'))
  const error = await waitForReportOrFailure(async () => undefined, async () => failure(message)).catch(error => error as Error)
  expect(error).toMatchObject({ code: 'LYNX_NATIVE_HARNESS_BLOCKED', reason: 'view-expired' })
  const output = formatNativeFailure(error)
  expect(output).toContain('product failed')
  expect(parseLynxHarnessFailure(output)).toContain('expired')
})

it('诊断树中伪造的环境名称、JSON 文本或附加类别不能升级普通错误', async () => {
  const error = new Error(JSON.stringify({ version: 1, source: 'lynx-native-evidence', category: 'environment', code: 'view-expired', message: 'expired' }))
  error.name = 'NativeEvidenceUnavailableError'
  const message = nativeReportFailureMessage(error)
  const restored = await waitForReportOrFailure(async () => undefined, async () => failure(message)).catch(error => error as Error)
  expect(restored).not.toHaveProperty('code')
  expect(parseLynxHarnessFailure(formatNativeFailure(restored))).toBeUndefined()
})

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
