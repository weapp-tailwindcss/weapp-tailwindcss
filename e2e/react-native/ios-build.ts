import type { IosApplicationArchitecture } from './ios-architecture'
import { createHash } from 'node:crypto'
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { EnvironmentBlockedError } from '../tailwind-capabilities/environment-block'
import { collectIosApplicationArchitecture } from './ios-architecture'
import { withIosBuildScratch } from './ios-build-scratch'
import { iosAppWasNotRunning } from './ios-command'
import { inspectIosBundleProvider } from './ios-provider'
import { iosRuntimeArguments, launchIosRuntime } from './ios-runtime'

export interface IosBuildOptions {
  project: string
  device: string
  metroUrl: string
  artifacts: string
  bundleId: string
}

export type IosBuildCommand = (file: string, args: string[], cwd: string, stream?: boolean) => Promise<string>

/** 只使用唯一的 Expo 原生工程，不猜测其它工作区或 Pods 的 scheme。 */
export async function iosBuildProject(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true })
  const projects = entries.filter(entry => entry.isDirectory() && entry.name.endsWith('.xcodeproj'))
  const workspaces = entries.filter(entry => entry.isDirectory() && entry.name.endsWith('.xcworkspace'))
  if (projects.length !== 1 || workspaces.length !== 1) {
    throw new Error('iOS 原生构建需要唯一的 Expo xcodeproj 和 xcworkspace')
  }
  return { workspace: path.join(directory, workspaces[0]!.name), scheme: path.basename(projects[0]!.name, '.xcodeproj') }
}

/** build settings 必须指向本轮 derived data 中唯一且正确的应用。 */
export async function iosBuildApplication(source: string, derivedData: string, bundleId: string) {
  const settings = JSON.parse(source) as Array<{ buildSettings?: Record<string, string> }>
  const matches = settings.filter(item => item.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER === bundleId && item.buildSettings.WRAPPER_EXTENSION === 'app')
  if (matches.length !== 1) {
    throw new Error('iOS build settings 没有唯一的目标应用身份')
  }
  const values = matches[0]!.buildSettings!
  if (!values.TARGET_BUILD_DIR || !path.isAbsolute(values.TARGET_BUILD_DIR) || !values.FULL_PRODUCT_NAME || path.basename(values.FULL_PRODUCT_NAME) !== values.FULL_PRODUCT_NAME || !values.FULL_PRODUCT_NAME.endsWith('.app')) {
    throw new Error('iOS build settings 包含无效产物路径')
  }
  const [root, application] = await Promise.all([
    realpath(derivedData),
    realpath(path.resolve(values.TARGET_BUILD_DIR, values.FULL_PRODUCT_NAME)),
  ])
  const relative = path.relative(root, application)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('iOS 应用产物越过本轮 derived data')
  }
  return application
}

async function binaryHashes(application: string, executable: string) {
  const files = (await readdir(application)).filter(name => name === executable || name === 'Info.plist' || name.endsWith('.dylib')).sort()
  if (!files.includes(executable) || !files.includes('Info.plist')) {
    throw new Error('iOS 应用缺少主程序或 Info.plist')
  }
  return Object.fromEntries(await Promise.all(files.map(async name => [name, createHash('sha256').update(await readFile(path.join(application, name))).digest('hex')])))
}

/** 构建、安装和直接启动均绑定预检指定的设备，不依赖 Simulator.app 的 GUI 发现。 */
export async function buildAndLaunchIos(options: IosBuildOptions, execute: IosBuildCommand) {
  const { project, device, artifacts, bundleId, metroUrl } = options
  iosRuntimeArguments(options)
  const directory = path.join(project, 'ios')
  const evidence: Record<string, unknown> = { provider: 'expo-prebuild-xcodebuild-simctl', device, bundleId, metroUrl, stage: 'prebuild' }
  const save = () => writeFile(path.join(artifacts, 'ios-build.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  return withIosBuildScratch(project, evidence, save, async (derivedData) => {
    try {
      await execute('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios', '--no-install'], project, true)
      evidence.stage = 'bundle-provider'
      await save()
      const { contents, ...bundleProvider } = inspectIosBundleProvider(project)
      await writeFile(path.join(artifacts, 'ios-app-delegate.swift'), contents)
      evidence.bundleProvider = bundleProvider
      await execute('pod', ['install', `--project-directory=${directory}`], project, true)
      const build = await iosBuildProject(directory)
      Object.assign(evidence, build, { stage: 'build' })
      await save()
      const args = ['-workspace', build.workspace, '-scheme', build.scheme, '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', `id=${device}`, '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO']
      await execute('xcodebuild', [...args, 'build'], project, true)
      evidence.stage = 'build-settings'
      await save()
      const settings = await execute('xcodebuild', [...args, '-showBuildSettings', '-json'], project)
      await writeFile(path.join(artifacts, 'ios-build-settings.json'), settings)
      evidence.buildSettings = 'ios-build-settings.json'
      await save()
      const application = await iosBuildApplication(settings, derivedData, bundleId)
      if (!(await stat(application)).isDirectory()) {
        throw new Error('iOS 本轮构建未生成应用目录')
      }
      const plist = path.join(application, 'Info.plist')
      const actualId = (await execute('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist], project)).trim()
      const executable = (await execute('plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', plist], project)).trim()
      if (actualId !== bundleId || !executable || path.basename(executable) !== executable) {
        throw new Error('iOS 本轮应用的 bundle ID 或可执行文件不符')
      }
      Object.assign(evidence, { stage: 'install', application, executable })
      await save()
      await execute('xcrun', ['simctl', 'install', device, application], project, true)
      const container = (await execute('xcrun', ['simctl', 'get_app_container', device, bundleId, 'app'], project)).trim()
      if (!path.isAbsolute(container)) {
        throw new Error('iOS 已安装应用没有有效容器')
      }
      const [built, installed] = await Promise.all([binaryHashes(application, executable), binaryHashes(await realpath(container), executable)])
      if (JSON.stringify(built) !== JSON.stringify(installed)) {
        throw new Error('iOS 模拟器内应用与本轮构建二进制不一致')
      }
      const applicationArchitecture: IosApplicationArchitecture = { source: 'installed-app-single-slice', files: [] }
      Object.assign(evidence, { stage: 'application-architecture', container, binarySha256: built, applicationArchitecture })
      await save()
      await collectIosApplicationArchitecture(applicationArchitecture, { application, container, executable, hashes: built, project }, execute, save)
      evidence.stage = 'terminate'
      await save()
      try {
        await execute('xcrun', ['simctl', 'terminate', device, bundleId], project)
        evidence.termination = { status: 'terminated' }
      }
      catch (error) {
        if (!iosAppWasNotRunning(error, bundleId)) {
          throw new EnvironmentBlockedError(`iOS target app termination failed: ${String(error)}`, { cause: error })
        }
        evidence.termination = { status: 'not-running', exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
      }
      evidence.stage = 'launch'
      await save()
      evidence.launch = await launchIosRuntime(options, execute)
      evidence.stage = 'launch-request-completed'
      await save()
    }
    catch (error) {
      evidence.failure = String(error)
      return runWithCleanup(() => Promise.reject(error), save)
    }
  })
}
