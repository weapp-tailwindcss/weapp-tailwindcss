import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { awaitIosApplicationEnvironment, iosApplicationAbi } from './react-native/ios-architecture'
import { buildAndLaunchIos } from './react-native/ios-build'
import { withNativeEnvironment } from './react-native/native-environment'
import { reportFromStaticEvidence } from './react-native/reports'

vi.mock('./react-native/ios-provider', () => ({
  inspectIosBundleProvider: () => ({ contents: 'delegate', sha256: 'provider', debugProvider: 'RCTBundleURLProvider.sharedSettings' }),
}))

const directories: string[] = []
const bundleId = 'com.weapptailwindcss.rncompat'
const device = 'bound-ios-device'

async function fixture(architecture = 'arm64') {
  const project = await mkdtemp(path.join(tmpdir(), 'rn-ios-architecture-'))
  directories.push(project)
  const artifacts = path.join(project, 'evidence')
  const container = path.join(project, 'Installed App.app')
  await Promise.all([
    mkdir(artifacts),
    mkdir(container),
    mkdir(path.join(project, 'ios', 'RN.xcodeproj'), { recursive: true }),
    mkdir(path.join(project, 'ios', 'RN.xcworkspace'), { recursive: true }),
  ])
  let application = ''
  const execute = vi.fn(async (file: string, args: string[]) => {
    if (file === 'xcodebuild') {
      application = path.join(args[args.indexOf('-derivedDataPath') + 1]!, 'Products', 'RN App.app')
      if (args.includes('build')) {
        await mkdir(application, { recursive: true })
        for (const name of ['RNApp', 'RNApp.debug.dylib', 'Info.plist']) {
          await writeFile(path.join(application, name), `current ${name}`)
        }
        await cp(application, container, { recursive: true })
        return ''
      }
      return JSON.stringify([{ buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: bundleId, WRAPPER_EXTENSION: 'app', TARGET_BUILD_DIR: path.dirname(application), FULL_PRODUCT_NAME: path.basename(application) } }])
    }
    if (file === 'plutil') {
      return args[1] === 'CFBundleIdentifier' ? bundleId : 'RNApp'
    }
    if (args[0] === 'lipo') {
      return `${architecture}\n`
    }
    if (args[1] === 'get_app_container') {
      return container
    }
    if (args[1] === 'launch') {
      return `${bundleId}: 12345\n`
    }
    return ''
  })
  return { options: { project, artifacts, bundleId, device, metroUrl: 'http://127.0.0.1:8081' }, execute, container, receipt: async () => JSON.parse(await readFile(path.join(artifacts, 'ios-build.json'), 'utf8')) }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it.each(['arm64', 'x86_64'])('应用 ABI 来自本轮 built/installed 主程序及 Debug dylib：%s', async (abi) => {
  const current = await fixture(abi)
  await buildAndLaunchIos(current.options, current.execute)
  const evidence = await current.receipt()
  expect(iosApplicationAbi(JSON.stringify(evidence), device, bundleId)).toBe(abi)
  expect(evidence.applicationArchitecture).toMatchObject({ source: 'installed-app-single-slice', abi })
  expect(evidence.applicationArchitecture.files).toHaveLength(4)
  for (const entry of evidence.applicationArchitecture.files) {
    expect(entry.abi).toBe(abi)
    expect(entry.stdout).toBe(`${abi}\n`)
    expect(entry.sha256).toBe(createHash('sha256').update(`current ${entry.name}`).digest('hex'))
    expect(entry.sha256).toBe(evidence.binarySha256[entry.name])
    expect(current.execute).toHaveBeenCalledWith('xcrun', ['lipo', '-archs', entry.path], current.options.project)
  }
})

it.each(['', 'arm64 x86_64', 'arm64 arm64', 'unknown', 'arm64\nextra'])('空白、多 slice 或未知 ABI 不推断为本机架构：%s', async (output) => {
  const current = await fixture(output)
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toThrow('ABI')
  expect(current.execute.mock.calls.some(([, args]) => args[1] === 'launch')).toBe(false)
  expect(await current.receipt()).toMatchObject({ stage: 'application-architecture', failure: expect.stringContaining('ABI') })
})

it('主壳 arm64 不能掩盖已安装 Debug dylib 的其它架构', async () => {
  const current = await fixture()
  const original = current.execute.getMockImplementation()!
  current.execute.mockImplementation(async (file, args) => args[0] === 'lipo' && args[2] === path.join(current.container, 'RNApp.debug.dylib') ? 'x86_64\n' : original(file, args))
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toThrow('ABI')
  expect(current.execute.mock.calls.some(([, args]) => args[1] === 'launch')).toBe(false)
})

it('架构读取失败保留原错误并阻断启动', async () => {
  const current = await fixture()
  const failure = new Error('lipo failed')
  const original = current.execute.getMockImplementation()!
  current.execute.mockImplementation(async (file, args) => {
    if (args[0] === 'lipo') {
      throw failure
    }
    return original(file, args)
  })
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toBe(failure)
  expect(current.execute.mock.calls.some(([, args]) => args[1] === 'launch')).toBe(false)
})

it.each([
  { device: 'other-device' },
  { bundleId: 'other.app' },
  { stage: 'application-architecture' },
  { failure: 'failed' },
  { scratch: { status: 'active' } },
  { launch: { device, bundleId, pid: 0 } },
  { launch: { device: 'other-device', bundleId, pid: 12345 } },
  { launch: { device, bundleId: 'other.app', pid: 12345 } },
  { binarySha256: {} },
  { applicationArchitecture: {} },
])('未完成或其它应用的落盘回执不得成为本轮报告 ABI：%j', async (override) => {
  const current = await fixture()
  await buildAndLaunchIos(current.options, current.execute)
  const evidence = await current.receipt()
  expect(() => iosApplicationAbi(JSON.stringify({ ...evidence, ...override }), device, bundleId)).toThrow('ABI')
})

it.each(['missing', 'duplicate', 'hash', 'stdout', 'derived', 'path'])('逐文件的架构证据不可缺失或互相矛盾：%s', async (change) => {
  const current = await fixture()
  await buildAndLaunchIos(current.options, current.execute)
  const evidence = await current.receipt()
  const files = evidence.applicationArchitecture.files
  if (change === 'missing') {
    files.pop()
  }
  if (change === 'duplicate') {
    files[1] = files[0]
  }
  if (change === 'hash') {
    files[0].sha256 = '0'.repeat(64)
  }
  if (change === 'stdout') {
    files[0].stdout = 'x86_64\n'
  }
  if (change === 'derived') {
    files[0].abi = 'x86_64'
  }
  if (change === 'path') {
    files[0].path = path.join(current.container, 'other-binary')
  }
  expect(() => iosApplicationAbi(JSON.stringify(evidence), device, bundleId)).toThrow('ABI')
})

it('runner 的启动边界完成后才读取构建回执，三个阶段共享应用 ABI', async () => {
  const current = await fixture()
  await buildAndLaunchIos(current.options, current.execute)
  const source = await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8')
  const environment = { abi: 'simulator', deviceName: 'selected-device' }
  let complete!: (value: string) => void
  const launchCompletion = new Promise<string>((resolve) => {
    complete = resolve
  })
  const readReceipt = vi.fn(async () => source)
  const boundary = awaitIosApplicationEnvironment(launchCompletion, environment, readReceipt, device, bundleId)
  expect(readReceipt).not.toHaveBeenCalled()
  expect(environment.abi).toBe('simulator')
  complete('baseline-ready')
  await expect(boundary).resolves.toBe('baseline-ready')
  expect(readReceipt).toHaveBeenCalledOnce()
  const reports = ['baseline', 'tsx-hmr', 'css-hmr'].map((revision, index) => ({
    ...reportFromStaticEvidence('ios', [], { deviceName: 'ios-runtime', osName: 'ios', osVersion: '18.5', runtimeIdentifier: 'expo-ios', abi: 'simulator', viewport: { width: 400 + index, height: 800, pixelRatio: 3 } }),
    revision,
  }))
  const merged = reports.map(report => withNativeEnvironment(report, environment))
  expect(merged.map(report => report.environment.abi)).toEqual(['arm64', 'arm64', 'arm64'])
  expect(merged.map(report => report.environment.viewport.width)).toEqual([400, 401, 402])
  expect(reports.map(report => report.environment.abi)).toEqual(['simulator', 'simulator', 'simulator'])
})

it('runner 的真实启动门禁拒绝时零回执读取，不覆盖环境或重试', async () => {
  const failure = new Error('launch failed')
  const environment = { abi: 'simulator' }
  const readReceipt = vi.fn(async () => '')
  await expect(awaitIosApplicationEnvironment(Promise.reject(failure), environment, readReceipt, device, bundleId)).rejects.toBe(failure)
  expect(readReceipt).not.toHaveBeenCalled()
  expect(environment.abi).toBe('simulator')
})

it('runner 收到错误应用的回执仍阻断，不能把其它 ABI 写入三个阶段', async () => {
  const current = await fixture()
  await buildAndLaunchIos(current.options, current.execute)
  const source = JSON.stringify({ ...await current.receipt(), device: 'other-device' })
  const environment = { abi: 'simulator' }
  const readReceipt = vi.fn(async () => source)
  await expect(awaitIosApplicationEnvironment(Promise.resolve('ready'), environment, readReceipt, device, bundleId)).rejects.toThrow('ABI')
  expect(readReceipt).toHaveBeenCalledOnce()
  expect(environment.abi).toBe('simulator')
})
