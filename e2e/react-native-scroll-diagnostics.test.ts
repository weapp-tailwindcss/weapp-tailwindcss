import type { NativeSemanticDiagnostic, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createNativeDiagnosticWriter } from './react-native/failure-diagnostics'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { pair, receipt, revision, withReporter } from './react-native/reporter-fixture'
import { validateReactNativeReport } from './react-native/reports'

function diagnostic(): NativeSemanticDiagnostic {
  return { version: 1, evidence: 'diagnostic-only', kind: 'scroll-client-failure', runId: 'run', revision, platform: 'web', runtimeInstallation: syntheticRuntimeInstallation(), id: 'sizing-size', phase: 'scroll-offset', message: 'owned scroll timeout', observed: { stepIndex: 0, pending: false, sides: [{ side: 'probe', command: { x: 0, y: 48 }, history: [] }] } }
}
function envelope() {
  return { hmrMarker: 'rn-hmr-baseline', cssHmrColor: '#10b981', report: { runId: 'run', revision, platform: 'web', receipts: [receipt(pair())], runtimeInstallation: syntheticRuntimeInstallation(), failureDiagnostic: diagnostic() } as ReactNativeReport }
}

it('同次失败report必须先落诊断再发布；error兜底不能替换身份或赋予成功', async () => {
  await withReporter(async ({ post, diagnostic: writer, complete }) => {
    await post('/case', pair())
    const order: string[] = []
    writer.mockImplementation(async () => {
      order.push('diagnostic')
    })
    complete.mockImplementation(async () => {
      order.push('report')
    })
    const input = envelope()
    expect((await post('/report', input)).status).toBe(204)
    expect(order).toEqual(['diagnostic', 'report'])
    expect(writer).toHaveBeenCalledWith(input.report.failureDiagnostic, expect.any(AbortSignal))
    expect(() => validateReactNativeReport(input.report)).toThrow(/failure diagnostics/)
  })
})

it.each(['resolve', 'reject'] as const)('诊断迟到%s纳入pending/drain，关闭不提前归档也不发布成功', async (outcome) => {
  await withReporter(async ({ reporter, post, diagnostic: writer, complete }) => {
    await post('/case', pair())
    let release!: () => void
    let reject!: (error: Error) => void
    let entered!: () => void
    const writing = new Promise<void>((resolve) => {
      entered = resolve
    })
    writer.mockImplementationOnce(() => new Promise<void>((resolve, fail) => {
      release = resolve
      reject = fail
      entered()
    }))
    const posting = post('/report', envelope())
    await writing
    expect(reporter.capturePending()).toBe(true)
    expect(() => reporter.setRevision('next-phase')).toThrow(/pending/)
    reporter.stop()
    let settled = false
    const draining = reporter.drain().then(() => {
      settled = true
    }, (error) => {
      settled = true
      throw error
    })
    const observed = draining.catch(error => error as Error)
    await Promise.resolve()
    expect(settled).toBe(false)
    if (outcome === 'resolve') {
      release()
    }
    else {
      reject(new Error('owned diagnostic write failed'))
    }
    expect((await posting).status).toBe(outcome === 'resolve' ? 409 : 500)
    const result = await observed
    if (outcome === 'reject') {
      expect(result).toBeInstanceOf(Error)
    }
    expect(complete).not.toHaveBeenCalled()
    expect(reporter.capturePending()).toBe(false)
  })
})

it.each(['runId', 'revision', 'platform', 'runtimeInstallation'] as const)('error兜底诊断%s不符，不落盘也不污染成功ledger', async (field) => {
  await withReporter(async ({ post, diagnostic: writer, reporter }) => {
    await post('/case', pair())
    const value = diagnostic()
    Object.assign(value, { [field]: field === 'runtimeInstallation' ? { ...value.runtimeInstallation, runtimeInstanceId: 'other-runtime' } : 'foreign' })
    expect((await post('/error', { runId: 'run', revision, message: 'original', diagnostic: value })).status).toBe(409)
    expect(writer).not.toHaveBeenCalled()
    expect(() => reporter.assertReady()).not.toThrow()
  })
})

it('独立诊断文件使用宿主序号，不能覆盖原件或充当receipt；取消写入显式失败', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-scroll-diagnostic-'))
  try {
    const writer = createNativeDiagnosticWriter(directory)
    const value = diagnostic()
    value.id = '../client-path'
    await writer(value, new AbortController().signal)
    await writer(value, new AbortController().signal)
    expect(await readdir(directory)).toEqual(['diagnostics'])
    expect(await readdir(path.join(directory, 'diagnostics'))).toEqual(['1.json', '2.json'])
    expect(JSON.parse(await readFile(path.join(directory, 'diagnostics', '1.json'), 'utf8'))).toEqual(value)
    const controller = new AbortController()
    controller.abort(new Error('owned close'))
    await expect(writer(value, controller.signal)).rejects.toThrow()
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it.each(['/report', '/error'])('%s诊断写盘失败同时保留原始语义错误和磁盘错误', async (route) => {
  await withReporter(async ({ post, diagnostic: writer, reporter }) => {
    await post('/case', pair())
    writer.mockRejectedValueOnce(new Error('owned disk failure'))
    const input = route === '/report' ? envelope() : { runId: 'run', revision, message: 'owned scroll timeout', diagnostic: diagnostic() }
    expect((await post(route, input)).status).toBe(500)
    let failure: AggregateError | undefined
    try {
      reporter.assertReady()
    }
    catch (error) {
      failure = error as AggregateError
    }
    const combined = failure!.errors[0] as AggregateError
    expect(combined.errors).toEqual([expect.objectContaining({ message: 'owned scroll timeout' }), expect.objectContaining({ message: 'owned disk failure' })])
  })
})
