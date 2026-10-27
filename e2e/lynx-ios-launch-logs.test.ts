import type { NativeEvidenceContext } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resolveIosAppContainer } from './lynx/ios-container'
import { command } from './lynx/native-command'
import { selectIosDevice } from './lynx/native-device'
import { waitForReportOrFailure } from './lynx/native-report'
import { runIos } from './lynx/run-ios'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
vi.mock('./lynx/ios-container', () => ({ resolveIosAppContainer: vi.fn() }))
vi.mock('./lynx/native-report', () => ({ waitForReportOrFailure: vi.fn() }))

const roots: string[] = []
const context: NativeEvidenceContext = { version: 1, runId: 'a33d850a-d54f-41a5-9a56-c840ed54231f', bundleSha256: 'a'.repeat(64) }
const inventory = JSON.stringify({ devices: { runtime: [{ udid: 'selected', name: '设备', state: 'Booted', isAvailable: true }] } })
const target = selectIosDevice(inventory, { LYNX_IOS_DEVICE_ID: 'selected' })
const options = { platform: 'ios' as const, bundlePath: undefined, captureOnly: false, outputDir: undefined, captureDurationSeconds: 15 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('LYNX_IOS_SKIP_PROJECT_GENERATION', '')
  vi.stubEnv('LYNX_IOS_SKIP_POD_INSTALL', '')
  vi.stubEnv('LYNX_IOS_DEVICE_ID', 'selected')
  vi.stubEnv('LYNX_IOS_DESTINATION', undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-launch-logs-'))
  roots.push(root)
  const artifactDir = path.join(root, 'artifacts')
  const logPath = path.join(root, 'selected')
  await fs.mkdir(artifactDir)
  await fs.mkdir(logPath)
  await fs.writeFile(path.join(logPath, 'actual-device.log'), 'bound device launch evidence')
  vi.mocked(resolveIosAppContainer).mockResolvedValue(path.join(root, 'container'))
  const source = { status: 'bound' as const, logPath, deviceId: target.id, runtime: target.runtime, runId: '123', runAttempt: '1', sha: 'a'.repeat(40), inventorySha256: 'b'.repeat(64) }
  const run = () => runIos(path.join(root, 'host'), artifactDir, target, context, options, vi.fn(), source)
  return { artifactDir, logPath, run }
}

it('启动首败导出同设备日志原始尾部，保留原错误及60秒参数，不重启或重试命令', async () => {
  const input = await fixture()
  const failure = new Error('original launch timeout')
  vi.mocked(command).mockImplementation(async (_name, args) => {
    if (args[1] === 'launch') {
      throw failure
    }
    return args[1] === 'list' ? inventory : ''
  })
  await expect(input.run()).rejects.toBe(failure)
  const directory = path.join(input.artifactDir, 'ios-launch-host-logs')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'collection.json'), 'utf8'))
  expect(manifest.acceptance).toBe('diagnostic-only')
  expect(manifest.source).toMatchObject({ deviceId: 'selected', runId: '123', runAttempt: '1' })
  const copied = manifest.files.find((file: { status: string }) => file.status === 'copied')
  expect(await fs.readFile(path.join(directory, copied.output), 'utf8')).toBe('bound device launch evidence')
  expect(vi.mocked(command).mock.calls.filter(([, args]) => args[1] === 'launch')).toEqual([
    ['xcrun', ['simctl', 'launch', '--terminate-running-process', 'selected', 'com.weapptailwindcss.lynxcompat'], path.join(path.dirname(input.artifactDir), 'host'), 60_000, { file: path.join(input.artifactDir, 'launch-command.json') }],
  ])
  expect(waitForReportOrFailure).not.toHaveBeenCalled()
  const native = JSON.parse(await fs.readFile(path.join(input.artifactDir, 'native-failure', context.runId, 'collection.json'), 'utf8'))
  expect(native.files).toHaveLength(41)
})

it('启动成功后报告失败不读取宿主日志，也不把诊断混入通过证据', async () => {
  const input = await fixture()
  vi.mocked(command).mockImplementation(async (_name, args) => args[1] === 'list' ? inventory : '')
  const failure = new Error('later report failure')
  vi.mocked(waitForReportOrFailure).mockRejectedValue(failure)
  const open = vi.spyOn(fs, 'opendir')
  await expect(input.run()).rejects.toBe(failure)
  expect(open).not.toHaveBeenCalled()
  await expect(fs.stat(path.join(input.artifactDir, 'ios-launch-host-logs'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('原生与宿主两类取证同时失败仍尝试双方，原启动错误保持聚合首项', async () => {
  const input = await fixture()
  const failure = new Error('launch failed')
  const hostFailure = new Error('host directory denied')
  vi.mocked(command).mockImplementation(async (_name, args) => {
    if (args[1] === 'launch') {
      throw failure
    }
    return args[1] === 'list' ? inventory : ''
  })
  const read = fs.readFile.bind(fs)
  vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
    if (String(file).includes(context.runId)) {
      throw new Error('native read denied')
    }
    return read(file, options)
  })
  vi.spyOn(fs, 'opendir').mockRejectedValue(hostFailure)
  const error = await input.run().catch(caught => caught)
  expect(error.errors).toHaveLength(3)
  expect(error.errors[0]).toBe(failure)
  expect(error.errors[2].errors[0]).toBe(hostFailure)
  const native = JSON.parse(await read(path.join(input.artifactDir, 'native-failure', context.runId, 'collection.json'), 'utf8'))
  expect(native.files.every((file: { status: string }) => file.status === 'failed')).toBe(true)
  const host = JSON.parse(await read(path.join(input.artifactDir, 'ios-launch-host-logs', 'collection.json'), 'utf8'))
  expect(host.status).toBe('partial')
})
