import { expect, it } from 'vitest'
import { nativeErrorDiagnostics, NativeOperationError, nativeReportFailureMessage, readNativeErrorDiagnostics } from './native-error-diagnostics'
import { NativeEvidenceUnavailableError, readNativeEvidenceFailure } from './native-failure'

it('聚合、恢复 cause、独立 stack 与操作上下文均可跨 JSON 原样取回', () => {
  const original = new Error('capture failed')
  original.stack = 'stack without message'
  const error = new AggregateError([
    new NativeOperationError({ phase: 'dark', operation: 'capture', runId: 'run', requestId: 'request', node: 'probe', artifact: 'probe.png' }, original),
    new Error('restore failed', { cause: new Error('native restore') }),
  ], 'collection failed')
  const value = JSON.parse(nativeReportFailureMessage(error))
  expect(readNativeErrorDiagnostics(value)).toMatchObject({ error: { errors: [
    { context: { phase: 'dark', operation: 'capture', requestId: 'request', node: 'probe', artifact: 'probe.png' }, cause: { message: 'capture failed', stack: 'stack without message' } },
    { message: 'restore failed', cause: { message: 'native restore' } },
  ] } })
  expect(readNativeEvidenceFailure(value)).toBeUndefined()
})

it.each(['cycle', 'depth'] as const)('首条因果链 %s 时保留兄弟恢复原因，明确登记截断', (kind) => {
  const first = new Error('first')
  if (kind === 'cycle') {
    first.cause = first
  }
  else {
    let tail = first
    for (let index = 0; index < 100; index++) {
      tail.cause = new Error(`deep-${index}`)
      tail = tail.cause as Error
    }
  }
  const value = JSON.parse(nativeReportFailureMessage(new AggregateError([first, new Error('restore', { cause: new Error('restore cause') })], 'collection and restore failed')))
  expect(readNativeErrorDiagnostics(value)).toBeDefined()
  expect(value.error.errors[1]).toMatchObject({ message: 'restore', cause: { message: 'restore cause' } })
  expect(JSON.stringify(value)).toContain(kind === 'cycle' ? 'cycle' : 'depth-limit')
})

it('超大错误树和文本有界、可解析且显式截断，不在序列化后截断 JSON', () => {
  const error = new AggregateError(Array.from({ length: 1000 }, () => new Error('x'.repeat(100_000))), 'too many errors')
  const value = JSON.parse(nativeReportFailureMessage(error))
  expect(readNativeErrorDiagnostics(value)).toBeDefined()
  expect(value.error.truncated).toBe('node-limit')
  expect(value.error.errors.length).toBeLessThan(32)
  expect(value.error.errors[0].truncated).toBe('text-limit')
  expect(JSON.stringify(value).length).toBeLessThan(200_000)
})

it('重复引用不是循环，非 Error 值和坏 cause 分支不遮住兄弟错误', () => {
  const repeated = new Error('repeated')
  const bad = new Error('bad getter')
  Object.defineProperty(bad, 'cause', { get() {
    throw new Error('unreadable')
  } })
  const value = nativeErrorDiagnostics(new AggregateError([bad, repeated, repeated, null, 0, false, 1n, Symbol('symbol')], 'mixed thrown values'))
  expect(value.error.errors?.map(error => error.message)).toEqual(['bad getter', 'repeated', 'repeated', 'null', '0', 'false', '1', 'Symbol(symbol)'])
  expect(value.error.errors?.[0]?.truncated).toBe('unreadable-error-property')
  expect(value.error.errors?.[2]?.truncated).toBeUndefined()
})

it.each(['bridge-unavailable', 'geometry-unavailable', 'view-expired', 'receipt-timeout'] as const)('明确 %s 分类保留旧根协议，诊断附带完整聚合树', (code) => {
  const value = JSON.parse(nativeReportFailureMessage(new AggregateError([new Error('product'), new NativeEvidenceUnavailableError(code, 'native failure')], 'both failed')))
  expect(readNativeEvidenceFailure(value)).toMatchObject({ code })
  expect(readNativeErrorDiagnostics(value.diagnostics)).toMatchObject({ error: { errors: [{ message: 'product' }, { message: 'native failure' }] } })
})

it.each(['version', 'source', 'error'] as const)('拒绝错误诊断的 %s 字段', (field) => {
  const value = nativeErrorDiagnostics(new Error('failure'))
  Object.assign(value, { [field]: field === 'version' ? 2 : 'invalid' })
  expect(readNativeErrorDiagnostics(value)).toBeUndefined()
})

it('拒绝无界、非法上下文和未知截断标记', () => {
  const value = nativeErrorDiagnostics(new Error('failure'))
  for (const error of [
    { name: 'Error', message: 'x'.repeat(1025) },
    { name: 'Error', message: 'x', context: { phase: 'other', operation: 'capture', runId: 'run', requestId: 'request' } },
    { name: 'Error', message: 'x', truncated: 'unknown' },
    { name: 'Error', message: 'x', errors: Array.from({ length: 33 }, () => ({ name: 'Error', message: 'x' })) },
  ]) {
    expect(readNativeErrorDiagnostics({ ...value, error })).toBeUndefined()
  }
})

it('节点总数未超预算也拒绝超过深度预算的跨桥树', () => {
  const value = nativeErrorDiagnostics(new Error('root'))
  let node = value.error
  for (let index = 0; index < 9; index++) {
    node.cause = { name: 'Error', message: `level-${index}` }
    node = node.cause
  }
  expect(readNativeErrorDiagnostics(value)).toBeUndefined()
})

it('拒绝跨桥上下文中的非白名单字段，不能经诊断向最终工件注入 env', () => {
  const value = nativeErrorDiagnostics(new NativeOperationError({ phase: 'light', operation: 'capture', runId: 'run', requestId: 'request' }, new Error('failure')))
  Object.assign(value.error.context!, { env: { SECRET: 'hidden' }, headers: { Authorization: 'hidden' } })
  expect(readNativeErrorDiagnostics(JSON.parse(JSON.stringify(value)))).toBeUndefined()
})

it('坏头字段、数字消息和不可读取 cause 不阻止跨桥保存兄弟恢复及明确环境错误', () => {
  const bad = new Error('unreadable')
  Object.defineProperty(bad, 'name', { get() {
    throw new Error('bad name')
  } })
  Object.defineProperty(bad, 'stack', { get() {
    throw new Error('bad stack')
  } })
  Object.defineProperty(bad, 'cause', { get() {
    throw new Error('bad cause')
  } })
  const numeric = Object.assign(new Error('numeric'), { message: 42 })
  const message = nativeReportFailureMessage(new AggregateError([bad, numeric, new Error('restore cause'), new NativeEvidenceUnavailableError('view-expired', 'expired')], 'collection failed'))
  const value = JSON.parse(message)
  expect(readNativeEvidenceFailure(value)).toMatchObject({ code: 'view-expired' })
  expect(readNativeErrorDiagnostics(value.diagnostics)).toMatchObject({ error: { errors: [
    { truncated: 'unreadable-error-property' },
    { message: '42' },
    { message: 'restore cause' },
    { message: 'expired' },
  ] } })
})

it('非 Error 长文本与过长请求上下文也显式标记截断', () => {
  expect(nativeErrorDiagnostics('x'.repeat(1025)).error).toMatchObject({ truncated: 'text-limit' })
  const value = nativeErrorDiagnostics(new NativeOperationError({ phase: 'light', operation: 'switch', runId: 'run', requestId: 'x'.repeat(257) }, new Error('failure')))
  expect(value.error).toMatchObject({ truncated: 'text-limit', context: { requestId: 'x'.repeat(256) } })
  expect(readNativeErrorDiagnostics(JSON.parse(JSON.stringify(value)))).toBeDefined()
})
