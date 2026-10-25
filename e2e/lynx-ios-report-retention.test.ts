import type { NativeEvidenceContext } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collectNativeEvidence } from './lynx/evidence'
import { resolveIosAppContainer } from './lynx/ios-container'
import { command } from './lynx/native-command'
import { selectIosDevice } from './lynx/native-device'
import { waitForReportOrFailure } from './lynx/native-report'
import { runIos } from './lynx/run-ios'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
vi.mock('./lynx/ios-container', () => ({ resolveIosAppContainer: vi.fn() }))
vi.mock('./lynx/native-report', () => ({ waitForReportOrFailure: vi.fn() }))
vi.mock('./lynx/evidence', async importOriginal => ({
  ...await importOriginal<typeof import('./lynx/evidence')>(),
  collectNativeEvidence: vi.fn(),
}))

const invoke = vi.mocked(command)
const collect = vi.mocked(collectNativeEvidence)
const roots: string[] = []
const context: NativeEvidenceContext = { version: 1, runId: 'a33d850a-d54f-41a5-9a56-c840ed54231f', bundleSha256: 'a'.repeat(64) }
const source = JSON.stringify({ evidence: context, platform: 'ios', results: [] })
const inventory = JSON.stringify({ devices: { runtime: [{ udid: 'selected', name: '设备', state: 'Booted', isAvailable: true }] } })
const target = selectIosDevice(inventory, { LYNX_IOS_DEVICE_ID: 'selected' })
const options = { platform: 'ios' as const, bundlePath: undefined, captureOnly: false, outputDir: undefined, captureDurationSeconds: 15 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('LYNX_IOS_SKIP_PROJECT_GENERATION', '')
  vi.stubEnv('LYNX_IOS_SKIP_POD_INSTALL', '')
  vi.stubEnv('LYNX_IOS_DEVICE_ID', 'selected')
  vi.stubEnv('LYNX_IOS_DESTINATION', undefined)
  invoke.mockImplementation(async (_name, args) => args[1] === 'list' ? inventory : '')
  vi.mocked(waitForReportOrFailure).mockResolvedValue(source)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function prepare() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-report-retention-'))
  roots.push(root)
  const artifactDir = path.join(root, 'artifacts')
  const container = path.join(root, 'container')
  await fs.mkdir(artifactDir)
  vi.mocked(resolveIosAppContainer).mockResolvedValue(container)
  return { root, artifactDir, container, run: () => runIos(path.join(root, 'host'), artifactDir, target, context, options, vi.fn()) }
}

it('整屏截图失败仍保留先收到的报告和语义证据，并原样传播截图异常', async () => {
  const { artifactDir, run } = await prepare()
  const crop = path.join(artifactDir, 'received-semantic-evidence.png')
  const failure = new Error('simctl screenshot timed out')
  collect.mockImplementation(async () => {
    expect(await fs.readFile(path.join(artifactDir, 'raw-report.json'), 'utf8')).toBe(source)
    await fs.writeFile(crop, 'native bytes')
  })
  invoke.mockImplementation(async (_name, args, _cwd, timeout) => {
    if (args.includes('screenshot')) {
      expect(timeout).toBe(60_000)
      expect(await fs.readFile(crop, 'utf8')).toBe('native bytes')
      throw failure
    }
    return args[1] === 'list' ? inventory : ''
  })
  await expect(run()).rejects.toBe(failure)
  expect(collect).toHaveBeenCalledExactlyOnceWith(JSON.parse(source), artifactDir, context, expect.any(Function))
  expect(await fs.readFile(path.join(artifactDir, 'raw-report.json'), 'utf8')).toBe(source)
  expect(await fs.readFile(crop, 'utf8')).toBe('native bytes')
  await expect(fs.stat(path.join(artifactDir, 'report.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  const diagnostic = JSON.parse(await fs.readFile(path.join(artifactDir, 'native-failure', context.runId, 'collection.json'), 'utf8'))
  expect(diagnostic.acceptance).toBe('diagnostic-only')
})

it('语义证据读取失败保留原始报告并停止后续截图，不生成成功报告', async () => {
  const { artifactDir, run } = await prepare()
  const failure = new Error('native artifact checksum mismatch')
  collect.mockRejectedValue(failure)
  await expect(run()).rejects.toBe(failure)
  expect(await fs.readFile(path.join(artifactDir, 'raw-report.json'), 'utf8')).toBe(source)
  expect(invoke.mock.calls.some(call => call[1].includes('screenshot'))).toBe(false)
  await expect(fs.stat(path.join(artifactDir, 'report.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('截图与失败取证都失败时保留原截图异常及独立取证异常', async () => {
  const { artifactDir, container, run } = await prepare()
  const failure = new Error('original screenshot failure')
  const nativeDirectory = path.join(container, 'Library', 'Application Support', 'lynx-compat', context.runId)
  await fs.mkdir(path.join(nativeDirectory, 'failure.json'), { recursive: true })
  collect.mockResolvedValue()
  invoke.mockImplementation(async (_name, args) => {
    if (args.includes('screenshot')) {
      throw failure
    }
    return args[1] === 'list' ? inventory : ''
  })
  const error = await run().then(() => undefined, caught => caught)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0]).toBe(failure)
  expect(error.errors[1]).toBeInstanceOf(AggregateError)
  expect(await fs.readFile(path.join(artifactDir, 'raw-report.json'), 'utf8')).toBe(source)
})

it('报告落盘失败不继续读取语义文件或截图', async () => {
  const { artifactDir, run } = await prepare()
  await fs.mkdir(path.join(artifactDir, 'raw-report.json'))
  await expect(run()).rejects.toMatchObject({ code: 'EISDIR' })
  expect(collect).not.toHaveBeenCalled()
  expect(invoke.mock.calls.some(call => call[1].includes('screenshot'))).toBe(false)
})

it('损坏报告保留原字节后拒绝解析，不继续截图', async () => {
  const { artifactDir, run } = await prepare()
  vi.mocked(waitForReportOrFailure).mockResolvedValue('{invalid')
  await expect(run()).rejects.toBeInstanceOf(SyntaxError)
  expect(await fs.readFile(path.join(artifactDir, 'raw-report.json'), 'utf8')).toBe('{invalid')
  expect(collect).not.toHaveBeenCalled()
  expect(invoke.mock.calls.some(call => call[1].includes('screenshot'))).toBe(false)
})

it('取证完成后仍执行相同设备、参数与预算的截图，再返回原报告', async () => {
  const { root, artifactDir, run } = await prepare()
  collect.mockResolvedValue()
  await expect(run()).resolves.toMatchObject({ device: target, result: source })
  const screenshot = invoke.mock.calls.find(call => call[1].includes('screenshot'))
  expect(screenshot).toEqual(['xcrun', ['simctl', 'io', 'selected', 'screenshot', path.join(artifactDir, 'screen.png')], path.join(root, 'host'), 60_000])
  expect(collect.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[invoke.mock.calls.indexOf(screenshot!)]!)
  await expect(fs.stat(path.join(artifactDir, 'report.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
