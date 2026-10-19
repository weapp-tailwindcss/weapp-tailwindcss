import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { buildAndLaunchIos, iosBuildApplication, iosBuildProject } from './react-native/ios-build'
import { executeIosCommand, IosCommandError } from './react-native/ios-command'
import { inspectIosBundleProvider } from './react-native/ios-provider'
import { EnvironmentBlockedError } from './tailwind-capabilities/environment-block'

vi.mock('./react-native/ios-provider', () => ({
  inspectIosBundleProvider: vi.fn((project: string) => ({ path: path.join(project, 'ios', 'Resolved', 'AppDelegate.swift'), contents: 'generated delegate', language: 'swift', sha256: 'provider-sha256', debugProvider: 'RCTBundleURLProvider.sharedSettings', bundleRoot: '.expo/.virtual-metro-entry', releaseResource: 'main.jsbundle' })),
}))

const directories: string[] = []
const bundleId = 'com.weapptailwindcss.rncompat'
const device = 'bound-ios-device'
const notRunning = 'An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=3):\nApplication termination failed.\nUnderlying error (domain=NSPOSIXErrorDomain, code=3):\n\tThe operation couldn’t be completed. No such process\n\tNo such process\n'
const nothingToTerminate = `An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=3):
Simulator device failed to terminate ${bundleId}.
found nothing to terminate
Underlying error (domain=NSPOSIXErrorDomain, code=3):
\tThe request to terminate "${bundleId}" failed. found nothing to terminate
\tfound nothing to terminate`

async function fixture() {
  const project = await mkdtemp(path.join(tmpdir(), 'tailwind-ios-build-'))
  directories.push(project)
  const artifacts = path.join(project, 'artifacts')
  const ios = path.join(project, 'ios')
  const derived = path.join(ios, '.tailwind-derived-data')
  const application = path.join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'RN App.app')
  const container = path.join(project, 'Installed App.app')
  await Promise.all([mkdir(artifacts), mkdir(path.join(ios, 'RN.xcodeproj'), { recursive: true }), mkdir(path.join(ios, 'RN.xcworkspace'), { recursive: true }), mkdir(application, { recursive: true })])
  for (const [name, content] of [['RNApp', 'binary'], ['Info.plist', 'metadata'], ['RNApp.debug.dylib', 'application library']]) {
    await writeFile(path.join(application, name!), content!)
  }
  await cp(application, container, { recursive: true })
  const settings = JSON.stringify([{ buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: bundleId, WRAPPER_EXTENSION: 'app', TARGET_BUILD_DIR: path.dirname(application), FULL_PRODUCT_NAME: path.basename(application) } }])
  const options = { project, artifacts, bundleId, device, metroUrl: 'http://127.0.0.1:8081' }
  const execute = vi.fn(async (file: string, args: string[], _cwd?: string, _stream?: boolean) => {
    if (file === 'xcodebuild' && args.includes('-showBuildSettings')) {
      return settings
    }
    if (file === 'plutil') {
      return args[1] === 'CFBundleIdentifier' ? bundleId : 'RNApp'
    }
    if (file === 'xcrun' && args[1] === 'get_app_container') {
      return container
    }
    if (file === 'xcrun' && args[1] === 'launch') {
      return `${bundleId}: 12345\n`
    }
    return ''
  })
  return { options, execute, application, container, derived, settings, ios }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('核对本轮安装二进制后直接启动应用，不经过系统深链确认弹窗', async () => {
  const current = await fixture()
  await buildAndLaunchIos(current.options, current.execute)
  const calls = current.execute.mock.calls
  expect(calls.map(([file]) => file)).toEqual(['pnpm', 'pod', 'xcodebuild', 'xcodebuild', 'plutil', 'plutil', 'xcrun', 'xcrun', 'xcrun', 'xcrun'])
  expect(calls[1]).toEqual(['pod', ['install', `--project-directory=${path.join(current.options.project, 'ios')}`], current.options.project, true])
  for (const [file, args] of calls) {
    if (file === 'xcodebuild') {
      expect(args).toContain(`id=${device}`)
    }
    if (file === 'xcrun' && args[1] !== 'launch') {
      expect(args[2]).toBe(device)
    }
    expect(args).not.toContain('boot')
  }
  expect(calls.at(-1)).toEqual(['xcrun', ['simctl', 'launch', '--terminate-running-process', device, bundleId, '-RCT_jsLocation', '127.0.0.1:8081', '-RCT_packager_scheme', 'http'], current.options.project, true])
  expect(calls.some(([, args]) => args[1] === 'openurl')).toBe(false)
  expect(calls.at(-2)).toEqual(['xcrun', ['simctl', 'terminate', device, bundleId], current.options.project])
  expect(JSON.parse(await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8'))).toMatchObject({ stage: 'launch-request-completed', device, bundleId, termination: { status: 'terminated' }, launch: { provider: 'simctl-launch-nsargumentdomain', pid: 12345 }, bundleProvider: { sha256: 'provider-sha256', debugProvider: 'RCTBundleURLProvider.sharedSettings' }, binarySha256: { 'RNApp': expect.any(String), 'RNApp.debug.dylib': expect.any(String) } })
  expect(await readFile(path.join(current.options.artifacts, 'ios-app-delegate.swift'), 'utf8')).toBe('generated delegate')
})

it('实际宿主没有消费 Debug provider 时在构建和设备操作前阻断', async () => {
  const current = await fixture()
  vi.mocked(inspectIosBundleProvider).mockImplementationOnce(() => {
    throw new Error('provider mismatch')
  })
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toThrow('provider mismatch')
  expect(current.execute.mock.calls.map(([file]) => file)).toEqual(['pnpm'])
  expect(JSON.parse(await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8'))).toMatchObject({ stage: 'bundle-provider', failure: 'Error: provider mismatch' })
})

it.each(['', 'other.app: 12345', `${bundleId}: 0`, `${bundleId}: 12345\n${bundleId}: 23456`])('命令成功但没有唯一目标 PID 不能标记启动完成：%s', async (stdout) => {
  const current = await fixture()
  const execute = current.execute.getMockImplementation()!
  current.execute.mockImplementation(async (file, args) => args[1] === 'launch' ? stdout : execute(file, args))
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toThrow('PID')
  expect(JSON.parse(await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8'))).toMatchObject({ stage: 'launch', failure: expect.stringContaining('PID') })
})

it.each([notRunning, nothingToTerminate])('明确的未运行错误可继续启动，并保留错误码和日志：%s', async (diagnostic) => {
  const current = await fixture()
  const execute = current.execute.getMockImplementation()!
  current.execute.mockImplementation(async (file, args) => {
    if (args[1] === 'terminate') {
      throw new IosCommandError(3, '', diagnostic)
    }
    return execute(file, args)
  })
  await buildAndLaunchIos(current.options, current.execute)
  expect(current.execute.mock.calls.at(-1)?.[1][1]).toBe('launch')
  expect(JSON.parse(await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8')).termination).toEqual({ status: 'not-running', exitCode: 3, stdout: '', stderr: diagnostic })
})

it.each([
  new IosCommandError(3, '', 'Invalid device: bound-ios-device'),
  new IosCommandError(3, '', 'CoreSimulatorService connection became invalid. No such process'),
  new IosCommandError(1, '', notRunning),
  new IosCommandError(3, '', nothingToTerminate.replaceAll(bundleId, 'different.app')),
  new IosCommandError(3, '', 'found nothing to terminate'),
  new IosCommandError(3, '', nothingToTerminate.replace('NSPOSIXErrorDomain', 'CoreSimulatorService')),
  new Error(notRunning),
])('其它 terminate 失败立即阻断，不启动应用：%s', async (failure) => {
  const current = await fixture()
  const execute = current.execute.getMockImplementation()!
  current.execute.mockImplementation(async (file, args) => {
    if (args[1] === 'terminate') {
      throw failure
    }
    return execute(file, args)
  })
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toMatchObject({ name: 'EnvironmentBlockedError', cause: failure })
  expect(current.execute.mock.calls.some(([, args]) => args[1] === 'launch')).toBe(false)
  expect(JSON.parse(await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8'))).toMatchObject({ stage: 'terminate', failure: String(new EnvironmentBlockedError(`iOS target app termination failed: ${String(failure)}`)) })
})

it('真实普通子进程失败保留 stdout、stderr 与退出码', async () => {
  const current = await fixture()
  await expect(executeIosCommand(process.execPath, ['-e', 'console.log("output"); console.error("failure"); process.exitCode=3'], current.options.project)).rejects.toMatchObject({ exitCode: 3, stdout: 'output', stderr: 'failure' })
})

it.each(['RNApp', 'RNApp.debug.dylib', 'Info.plist'])('旧安装文件 %s 不得启动', async (file) => {
  const current = await fixture()
  await writeFile(path.join(current.container, file), 'old build')
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toThrow('二进制不一致')
  expect(current.execute.mock.calls.some(([, args]) => args[1] === 'launch')).toBe(false)
})

it('构建失败不安装，保留原始失败阶段', async () => {
  const current = await fixture()
  const execute = current.execute.getMockImplementation()!
  current.execute.mockImplementation(async (file, args) => {
    if (file === 'xcodebuild') {
      throw new Error('compile failed')
    }
    return execute(file, args)
  })
  await expect(buildAndLaunchIos(current.options, current.execute)).rejects.toThrow('compile failed')
  expect(current.execute.mock.calls.some(([file]) => file === 'xcrun')).toBe(false)
  expect(JSON.parse(await readFile(path.join(current.options.artifacts, 'ios-build.json'), 'utf8'))).toMatchObject({ stage: 'build', failure: 'Error: compile failed' })
})

it('工程歧义、越界产物和错误应用身份必须拒绝', async () => {
  const current = await fixture()
  await mkdir(path.join(current.ios, 'Other.xcodeproj'))
  await expect(iosBuildProject(current.ios)).rejects.toThrow('唯一')
  expect(() => iosBuildApplication(current.settings, current.derived, 'other.app')).toThrow('身份')
  expect(() => iosBuildApplication(current.settings, path.join(current.derived, 'Other'), bundleId)).toThrow('越过')
  expect(() => iosBuildApplication(current.settings.replace('RN App.app', '../RN App.app'), current.derived, bundleId)).toThrow('路径')
  await expect(buildAndLaunchIos({ ...current.options, device: '' }, current.execute)).rejects.toThrow('明确设备')
  await expect(buildAndLaunchIos({ ...current.options, metroUrl: 'other.app://invalid' }, current.execute)).rejects.toThrow('Metro')
  expect(current.execute).not.toHaveBeenCalled()
})
