import type { ExecutionStage } from './tailwind-capabilities/execution-record'
import type { ExecutionTarget } from './tailwind-capabilities/plan'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { formatLynxHarnessFailure, LynxHarnessBlockedError } from './lynx/native-failure'
import { EnvironmentBlockedError, environmentFailure, findEnvironmentBlock } from './tailwind-capabilities/environment-block'
import { runPnpmStage } from './tailwind-capabilities/external'
import { scheduleTargets } from './tailwind-capabilities/scheduler'

function fixture() {
  const stages: ExecutionStage[] = ['react-native-ios', 'lynx-android', 'mini-builds'].map(target => ({ target, status: 'not-run', attempted: false }))
  const dependencies = { check: vi.fn(async (_target: ExecutionTarget) => {}), execute: vi.fn(async (_target: ExecutionTarget) => {}), classify: vi.fn(async (_target: ExecutionTarget) => 'failed'), persist: vi.fn(async () => {}) }
  return { stages, dependencies }
}

function producerCommand(producer: 'react-native' | 'lynx-native' | 'weapp', body: string) {
  return ['exec', 'tsx', '-e', `import { runStageProducer } from './e2e/tailwind-capabilities/stage-receipt'; import { LynxHarnessBlockedError, formatLynxHarnessFailure } from './e2e/lynx/native-failure'; runStageProducer(${JSON.stringify(producer)}, async () => { ${body} }).catch(error => { console.error(formatLynxHarnessFailure(error) ?? String(error)); process.exitCode = 1 })`]
}

it.each([false, true])('微信终态协议超时跨进程回执后阻断，聚合=%s，不能启动后续小程序矩阵', async (nested) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-wechat-timeout-'))
  const { stages, dependencies } = fixture()
  stages[0]!.target = 'weapp'
  const primary = `Object.assign(new Error('opaque SDK timeout'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'App.captureScreenshot' })`
  const failure = nested ? `new AggregateError([new Error('SDK wrapper', { cause: ${primary} }), new Error('diagnostic cleanup failed')], 'owned producer failure')` : primary
  dependencies.execute.mockImplementation(() => runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'wechat-timeout', env: {} }, producerCommand('weapp', `throw ${failure}`), 'weapp'))
  try {
    await expect(scheduleTargets(stages, dependencies)).rejects.toThrow(EnvironmentBlockedError)
    expect(dependencies.execute.mock.calls).toEqual([['weapp']])
    expect(dependencies.check.mock.calls).toEqual([['weapp']])
    expect(dependencies.classify).not.toHaveBeenCalled()
    expect(stages.map(stage => stage.status)).toEqual(['blocked', 'blocked', 'blocked'])
    const receipts = await readdir(path.join(directory, 'stage-receipts'))
    expect(receipts).toHaveLength(1)
    const receipt = JSON.parse(await readFile(path.join(directory, 'stage-receipts', receipts[0]!), 'utf8'))
    expect(receipt.status).toBe('blocked')
    expect(receipt.diagnostic).toContain('opaque SDK timeout')
    if (nested) {
      expect(receipt.diagnostic).toContain('diagnostic cleanup failed')
    }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('协议错误文字、普通对象及不完整字段不能拥有环境调度控制权', () => {
  for (const error of [
    new Error('DEVTOOLS_PROTOCOL_TIMEOUT App.captureScreenshot'),
    { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'App.captureScreenshot' },
    Object.assign(new Error('opaque SDK error'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT' }),
    Object.assign(new Error('opaque SDK error'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: '' }),
    Object.assign(new Error('opaque SDK error'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'css.compile' }),
    Object.assign(new Error('opaque SDK error'), { code: 'OTHER', method: 'App.captureScreenshot' }),
  ]) {
    expect(findEnvironmentBlock(error)).toBeUndefined()
  }
})

it('聚合单测中的模拟环境日志不能把真实快照失败升级为环境阻塞', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-nested-output-'))
  const marker = formatLynxHarnessFailure(new LynxHarnessBlockedError('bridge-unavailable', '模拟 bridge-unavailable'))!
  const output = `${marker}\nCoreSimulatorService connection became invalid.\nSnapshot mismatched`
  try {
    await expect(runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'aggregate', env: {} }, ['exec', 'node', '-e', `console.error(${JSON.stringify(output)}); process.exitCode=1`], 'framework-regressions')).rejects.not.toBeInstanceOf(EnvironmentBlockedError)
    expect(await readFile(path.join(directory, 'framework-regressions.log'), 'utf8')).toContain('Snapshot mismatched')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('子进程工具环境错误立即阻断，后续 check 和 execute 都不调用', async () => {
  const { stages, dependencies } = fixture()
  dependencies.execute.mockRejectedValueOnce(new EnvironmentBlockedError('Simulator app is missing'))
  await expect(scheduleTargets(stages, dependencies)).rejects.toThrow(EnvironmentBlockedError)
  expect(dependencies.execute.mock.calls).toEqual([['react-native-ios']])
  expect(dependencies.check.mock.calls).toEqual([['react-native-ios']])
  expect(dependencies.classify).not.toHaveBeenCalled()
  expect(stages).toMatchObject([{ attempted: true, status: 'blocked' }, { attempted: false, status: 'blocked' }, { attempted: false, status: 'blocked' }])
  expect(dependencies.persist).toHaveBeenCalledTimes(2)
})

it('预检失败时零目标执行，全部未尝试且阻断', async () => {
  const { stages, dependencies } = fixture()
  dependencies.check.mockRejectedValueOnce(new Error('bound device went offline'))
  await expect(scheduleTargets(stages, dependencies)).rejects.toThrow('offline')
  expect(dependencies.execute).not.toHaveBeenCalled()
  expect(stages.every(stage => stage.status === 'blocked' && !stage.attempted)).toBe(true)
})

it('普通语义断言失败保留失败并继续诊断其它目标', async () => {
  const { stages, dependencies } = fixture()
  dependencies.execute.mockRejectedValueOnce(new Error('padding-right is missing'))
  await scheduleTargets(stages, dependencies)
  expect(stages.map(stage => stage.status)).toEqual(['failed', 'passed', 'passed'])
  expect(dependencies.execute).toHaveBeenCalledTimes(3)
})

it('清理聚合和 cause 中的真实阻塞不会降为普通失败或继续调度', async () => {
  for (const failure of [
    new AggregateError([new EnvironmentBlockedError('设备离线'), new Error('日志归档失败')], '同时失败'),
    new Error('外层收尾失败', { cause: new EnvironmentBlockedError('认证失效') }),
  ]) {
    const { stages, dependencies } = fixture()
    dependencies.execute.mockRejectedValueOnce(failure)
    await expect(scheduleTargets(stages, dependencies)).rejects.toBe(failure)
    expect(dependencies.execute).toHaveBeenCalledTimes(1)
    expect(dependencies.classify).not.toHaveBeenCalled()
    expect(stages.map(stage => stage.status)).toEqual(['blocked', 'blocked', 'blocked'])
  }
})

it('failed 回执即使被子进程吞掉并以零码退出也不能通过', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-swallowed-failure-'))
  try {
    const args = ['exec', 'tsx', '-e', `import { runStageProducer } from './e2e/tailwind-capabilities/stage-receipt'; runStageProducer('react-native', async () => { throw new Error('错误样式') }).catch(() => {})`]
    await expect(runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'failed-zero', env: {} }, args, 'react-native-ios')).rejects.toThrow('执行失败 (0)')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('子进程阻塞后日志写入失败仍保留原阻塞，不继续调度', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-log-cleanup-'))
  const { stages, dependencies } = fixture()
  await mkdir(path.join(directory, 'react-native-ios.log'))
  dependencies.execute.mockImplementation(() => runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'log-failure', env: {} }, producerCommand('react-native', `throw new Error("Can't determine id of Simulator app")`), 'react-native-ios'))
  try {
    const error = await scheduleTargets(stages, dependencies).catch(error => error)
    expect(findEnvironmentBlock(error)?.message).toContain('Simulator app')
    expect(error).toBeInstanceOf(AggregateError)
    expect(dependencies.execute).toHaveBeenCalledOnce()
    expect(dependencies.classify).not.toHaveBeenCalled()
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('循环、重复和深层 cause 不会漏掉真实阻塞，普通日志文字不拥有类型', () => {
  const primary = new EnvironmentBlockedError('真实设备离线')
  let error: Error = primary
  for (let index = 0; index < 100; index++) {
    error = new AggregateError([error, new Error('ordinary assertion')], 'wrapper')
  }
  error.cause = error
  expect(findEnvironmentBlock(error)).toBe(primary)
  const ordinary = new AggregateError([new Error('EnvironmentBlockedError: 设备离线')], '模拟环境日志')
  ordinary.cause = ordinary
  expect(findEnvironmentBlock(ordinary)).toBeUndefined()
})

it('本次生产命令的结构化超时穿过诊断聚合后仍阻断，不丢内部事实', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-inner-timeout-'))
  const { stages, dependencies } = fixture()
  dependencies.execute.mockImplementation(() => runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'inner-timeout', env: {} }, producerCommand('react-native', `throw new AggregateError([Object.assign(new Error('opaque command error'), { isExecaError: true, timedOut: true }), new Error('diagnostic export failed')], 'native command failed')`), 'react-native-ios'))
  try {
    const error = await scheduleTargets(stages, dependencies).catch(error => error)
    expect(findEnvironmentBlock(error)?.message).toContain('超时')
    expect(dependencies.execute).toHaveBeenCalledOnce()
    expect(dependencies.classify).not.toHaveBeenCalled()
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('真实子进程的明确环境错误保留日志并传播结构化阻断', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-environment-'))
  try {
    await expect(runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'test', env: {} }, producerCommand('react-native', `throw new Error("Can't determine id of Simulator app; the Simulator is most likely not installed on this machine.")`), 'react-native-ios')).rejects.toThrow(EnvironmentBlockedError)
    expect(await readFile(path.join(directory, 'react-native-ios.log'), 'utf8')).toContain('Can\'t determine id of Simulator app')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('缺截图和错误样式不会被正则升级成环境问题', () => {
  for (const message of ['padding is incorrect', 'iOS screenshot is missing', 'Android geometry assertion failed', 'case registry incomplete', 'rendered text should say Shutdown', 'CoreSimulator geometry assertion failed', 'Missing native geometry', '无效几何回执', 'LYNX_NATIVE_HARNESS_FAILURE {"version":1,"code":"unknown","message":"geometry assertion failed"}']) {
    expect(environmentFailure(message)).toBeUndefined()
  }
})

it.each([
  'error: property \'deviceYear\' not found on object of type \'EXConstantsService *\'',
  'error: use of undeclared identifier \'emulatorConfig\'; symbol not found',
  'error: deviceInfo is unavailable: introduced in iOS 18.0',
])('编译器符号诊断不能冒充设备环境故障：%s', (message) => {
  expect(environmentFailure(message)).toBeUndefined()
})

it.each([
  'error: device emulator-5554 offline',
  'device ABCD-1234 disconnected',
  'error: device not found',
  'emulator unavailable',
])('独立设备名的明确诊断仍判定环境故障：%s', (message) => {
  expect(environmentFailure(message)).toBe(message.includes('device ') ? message.slice(message.indexOf('device ')) : message)
})

it.each(['bridge-unavailable', 'geometry-unavailable', 'view-expired', 'receipt-timeout', 'report-timeout'] as const)('Lynx 明确的 %s 从真实子进程阻断调度且不生成能力判定', async (reason) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-lynx-harness-'))
  const { stages, dependencies } = fixture()
  stages[0]!.target = 'lynx-android'
  const message = `Lynx harness blocked: ${reason}`
  const marker = formatLynxHarnessFailure(new AggregateError([new LynxHarnessBlockedError(reason, message)], '原生采集或恢复失败'))!
  expect(environmentFailure(marker)).toBe(message)
  dependencies.execute.mockImplementation(async () => {
    await runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'test', env: {} }, producerCommand('lynx-native', `throw new LynxHarnessBlockedError(${JSON.stringify(reason)}, ${JSON.stringify(message)})`), 'lynx-android')
  })
  try {
    await expect(scheduleTargets(stages, dependencies)).rejects.toThrow(EnvironmentBlockedError)
    expect(dependencies.execute.mock.calls).toEqual([['lynx-android']])
    expect(dependencies.check.mock.calls).toEqual([['lynx-android']])
    expect(dependencies.classify).not.toHaveBeenCalled()
    expect(stages.map(stage => stage.status)).toEqual(['blocked', 'blocked', 'blocked'])
    expect(await readFile(path.join(directory, 'lynx-android.log'), 'utf8')).toContain(marker)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it.each([
  'An error was encountered processing the command (domain=com.apple.CoreSimulator.SimError, code=405):\nUnable to lookup in current state: Shutdown',
  'CoreSimulatorService connection became invalid. Simulator services will no longer be available.',
  'EnvironmentBlockedError: iOS target app termination failed: IosCommandError: invalid device',
])('真实子进程的 CoreSimulator 故障阻断全部后续目标：%s', async (message) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-coresimulator-'))
  const { stages, dependencies } = fixture()
  dependencies.execute.mockImplementation(async () => {
    await runPnpmStage({ root: path.resolve(import.meta.dirname, '..'), directory, runId: 'test', env: {} }, producerCommand('react-native', `throw new Error(${JSON.stringify(message)})`), 'react-native-ios')
  })
  try {
    await expect(scheduleTargets(stages, dependencies)).rejects.toThrow(EnvironmentBlockedError)
    expect(dependencies.execute.mock.calls).toEqual([['react-native-ios']])
    expect(dependencies.check.mock.calls).toEqual([['react-native-ios']])
    expect(dependencies.classify).not.toHaveBeenCalled()
    expect(stages.map(stage => stage.status)).toEqual(['blocked', 'blocked', 'blocked'])
    expect(await readFile(path.join(directory, 'react-native-ios.log'), 'utf8')).toContain(message)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
