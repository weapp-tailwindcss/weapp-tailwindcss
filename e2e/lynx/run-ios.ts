import type { NativeEvidenceContext, NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import type { NativeRunStage } from './native-artifacts'
import type { IosBuildTarget } from './native-device'
import type { NativeRunOptions } from './native-options'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { collectCaptureScrollEvidence } from './capture-scroll'
import { collectNativeEvidence } from './evidence'
import { withBuiltIosDevice } from './ios-build-target'
import { resolveIosAppContainer } from './ios-container'
import { recordIosVideo } from './ios-recording'
import { command } from './native-command'
import { iosPodInstallArguments } from './native-options'
import { waitForReportOrFailure } from './native-report'

const applicationId = 'com.weapptailwindcss.lynxcompat'

export async function runIos(hostDir: string, artifactDir: string, target: IosBuildTarget, context: NativeEvidenceContext, options: NativeRunOptions, setStage: (stage: NativeRunStage) => void) {
  setStage('native-build')
  if (process.env['LYNX_IOS_SKIP_PROJECT_GENERATION'] !== '1') {
    await command('xcodegen', ['generate'], hostDir, 60_000)
  }
  else if (!await fs.stat(path.join(hostDir, 'LynxCompatibilityHost.xcodeproj')).then(() => true).catch(() => false)) {
    throw new Error('LYNX_IOS_SKIP_PROJECT_GENERATION=1 requires an existing Xcode project in LYNX_NATIVE_WORK_DIR.')
  }
  if (process.env['LYNX_IOS_SKIP_POD_INSTALL'] === '1') {
    const requiredPaths = [path.join(hostDir, 'Pods'), path.join(hostDir, 'LynxCompatibilityHost.xcworkspace')]
    const ready = await Promise.all(requiredPaths.map(item => fs.stat(item).then(() => true).catch(() => false)))
    if (ready.some(item => !item)) {
      throw new Error('LYNX_IOS_SKIP_POD_INSTALL=1 requires an existing Pods directory and workspace in LYNX_NATIVE_WORK_DIR.')
    }
  }
  else {
    // Podfile 已固定 Lynx 版本，CI 不需要每次刷新整个 Specs CDN。
    await command(process.env['LYNX_POD'] ?? 'pod', iosPodInstallArguments(), hostDir, 600_000)
  }
  const derivedData = path.join(hostDir, 'DerivedData')
  return withBuiltIosDevice(target, hostDir, artifactDir, async () => {
    await command('xcodebuild', [
      '-quiet',
      '-workspace',
      'LynxCompatibilityHost.xcworkspace',
      '-scheme',
      'LynxCompatibilityHost',
      '-configuration',
      'Debug',
      '-sdk',
      'iphonesimulator',
      '-destination',
      target.destination,
      '-derivedDataPath',
      derivedData,
      'COMPILER_INDEX_STORE_ENABLE=NO',
      'build',
    ], hostDir, 1_800_000)
  }, async (device) => {
    setStage('native-run')
    await fs.writeFile(path.join(artifactDir, 'device.json'), `${JSON.stringify(device, null, 2)}\n`)
    const deviceId = device.id
    const appPath = path.join(derivedData, 'Build', 'Products', 'Debug-iphonesimulator', 'LynxCompatibilityHost.app')
    if (options.assetsPath) {
      const assets = path.join(appPath, 'capture-assets')
      await fs.rm(assets, { recursive: true, force: true })
      await fs.cp(path.join(hostDir, 'App', 'capture-assets'), assets, { recursive: true })
    }
    await command('xcrun', ['simctl', 'install', deviceId, appPath], hostDir, 120_000)
    const container = await resolveIosAppContainer(deviceId, applicationId, hostDir, async (error) => {
      const detail = error instanceof Error ? error.stack : String(error)
      await fs.writeFile(path.join(artifactDir, 'container-query-timeout.txt'), `${detail}\n`)
      process.stderr.write('iOS 应用容器查询超时；已保留原始错误，等待指定模拟器就绪后仅再查询一次。\n')
    }, target.state === 'Shutdown')
    const reportPath = path.join(container, 'Library', 'Application Support', 'lynx-compat', context.runId, 'report.json')
    await command('xcrun', ['simctl', 'launch', '--terminate-running-process', deviceId, applicationId], hostDir, 60_000, { file: path.join(artifactDir, 'launch-command.json') })
    if (options.captureOnly) {
      await new Promise(resolve => setTimeout(resolve, 2200))
      await command('xcrun', ['simctl', 'io', deviceId, 'screenshot', path.join(artifactDir, 'screen.png')], hostDir, 60_000)
      await recordIosVideo(deviceId, artifactDir, options.captureDurationSeconds, options.captureScroll
        ? () => collectCaptureScrollEvidence(path.join(path.dirname(reportPath), 'capture-scroll.json'), artifactDir, context, options.captureDurationSeconds)
        : undefined)
      return undefined
    }
    const source = await waitForReportOrFailure(
      async () => fs.readFile(reportPath, 'utf8').catch(() => undefined),
      async () => fs.readFile(path.join(container, 'Library', 'Application Support', 'lynx-compat', context.runId, 'failure.json'), 'utf8').catch(() => undefined),
    )
    await command('xcrun', ['simctl', 'io', deviceId, 'screenshot', path.join(artifactDir, 'screen.png')], hostDir, 60_000)
    await fs.writeFile(path.join(artifactDir, 'raw-report.json'), source)
    const report = JSON.parse(source) as NativePlatformReport
    const directory = path.join(container, 'Library', 'Application Support', 'lynx-compat', context.runId, 'artifacts')
    await collectNativeEvidence(report, artifactDir, context, name => fs.readFile(path.join(directory, name)))
    return source
  }, process.env, () => setStage('device-readiness'))
}
