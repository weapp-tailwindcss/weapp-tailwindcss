import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { iosBundleProviderEvidence } from './react-native/ios-provider'
import { iosRuntimeArguments, launchIosRuntime } from './react-native/ios-runtime'

const options = { device: 'bound-device', bundleId: 'com.weapptailwindcss.rncompat', metroUrl: 'http://127.0.0.1:8081', project: 'project directory' }
const appDelegate = `
let delegate = ReactNativeDelegate()
let factory = ExpoReactNativeFactory(delegate: delegate)
bindReactNativeFactory(factory)
factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }
  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`

it('直接启动始终创建新进程，使用 RN 实际读取的 NSArgumentDomain 键和无 shell 参数数组', async () => {
  const execute = vi.fn(async () => `${options.bundleId}: 23456\n`)
  const receipt = await launchIosRuntime(options, execute)
  expect(execute).toHaveBeenCalledExactlyOnceWith('xcrun', ['simctl', 'launch', '--terminate-running-process', options.device, options.bundleId, '-RCT_jsLocation', '127.0.0.1:8081', '-RCT_packager_scheme', 'http'], options.project, true)
  expect(receipt).toMatchObject({ pid: 23456, device: options.device, bundleId: options.bundleId, metroUrl: options.metroUrl })
})

it.each([
  ['https://localhost:443', 'localhost:443', 'https'],
  ['https://localhost', 'localhost:443', 'https'],
  ['http://localhost:80', 'localhost:80', 'http'],
  ['http://localhost', 'localhost:80', 'http'],
  ['http://[::1]:8081', '[::1]:8081', 'http'],
])('协议和 IPv6 host 传给 provider，默认端口不能被 RN 改成 8081：%s', (metroUrl, hostPort, scheme) => {
  expect(iosRuntimeArguments({ ...options, metroUrl: metroUrl! }).slice(-4)).toEqual(['-RCT_jsLocation', hostPort, '-RCT_packager_scheme', scheme])
})

it.each(['not a URL', 'com.app://metro', 'http://user:password@localhost:8081', 'http://localhost:8081/path', 'http://localhost:8081/?url=other', 'http://localhost:8081/#fragment'])('无效 Metro 地址在启动前拒绝：%s', async (metroUrl) => {
  const execute = vi.fn()
  await expect(launchIosRuntime({ ...options, metroUrl }, execute)).rejects.toThrow('Metro')
  expect(execute).not.toHaveBeenCalled()
})

it.each(['', 'booted', '-other', ' bound-device', 'bound device'])('隐式或无效设备不能启动：%s', (device) => {
  expect(() => iosRuntimeArguments({ ...options, device })).toThrow('明确设备')
})

it.each(['', 'other.app: 12', `${options.bundleId}: -1`, `${options.bundleId}: 0`, `${options.bundleId}: 1.2`, `${options.bundleId}: 01`, `${options.bundleId}: 9007199254740992`, `${options.bundleId}: 12\nextra`])('缺失、错误或歧义 PID 拒绝：%s', async (stdout) => {
  await expect(launchIosRuntime(options, async () => stdout)).rejects.toThrow('PID')
})

it('进程失败保留原始错误，不能变成启动成功', async () => {
  const failure = new Error('simctl launch failed')
  await expect(launchIosRuntime(options, async () => {
    throw failure
  })).rejects.toBe(failure)
})

it('生成的 AppDelegate 消费 Debug provider 和 Release bundle，保留原始源 hash', () => {
  expect(iosBundleProviderEvidence(appDelegate.replaceAll('\n', '\r\n'), 'swift')).toMatchObject({ debugProvider: 'RCTBundleURLProvider.sharedSettings', bundleRoot: '.expo/.virtual-metro-entry', releaseResource: 'main.jsbundle' })
  expect(iosBundleProviderEvidence(appDelegate, 'swift').sha256).toBe(createHash('sha256').update(appDelegate).digest('hex'))
})

it.each([
  appDelegate.replace('RCTBundleURLProvider.sharedSettings()', 'OtherProvider.sharedSettings()'),
  appDelegate.replace('#if DEBUG', '#if RELEASE'),
  appDelegate.replace('bridge.bundleURL ?? bundleURL()', 'bridge.bundleURL'),
  appDelegate.replace('ExpoReactNativeFactory(delegate: delegate)', 'ExpoReactNativeFactory(delegate: other)'),
  appDelegate.replace('bindReactNativeFactory(factory)', 'bindReactNativeFactory(other)'),
  appDelegate.replace('factory.startReactNative(', 'other.startReactNative('),
  appDelegate.replace('return Bundle.main.url', 'return other.url'),
  appDelegate.replace('return RCTBundleURLProvider', 'return other\n// return RCTBundleURLProvider'),
])('宿主 provider 或 factory 变化必须先阻断并审查', (source) => {
  expect(() => iosBundleProviderEvidence(source, 'swift')).toThrow('消费合同')
})

it('初启和恢复共用直接启动入口，iOS runner 不回退到 openurl', async () => {
  const directory = path.resolve(import.meta.dirname, 'react-native')
  const [build, run] = await Promise.all(['ios-build.ts', 'run-native.ts'].map(name => readFile(path.join(directory, name), 'utf8')))
  expect(build).toContain('await launchIosRuntime(options, execute)')
  expect(run).toContain('await launchIosRuntime({ device, bundleId: appId, metroUrl:')
  expect(run).not.toContain('\'openurl\'')
  expect(run).toContain('validateReactNativeReport(baselineReport, platform, { runId, revision:')
  expect(run).toContain('requireLaunchCompletion: true')
})
