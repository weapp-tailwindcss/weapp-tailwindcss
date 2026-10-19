import type { NativeEvidenceContext, NativePlatformReport, Platform } from '../../examples/react-lynx/src/compatibility/types'
import type { AndroidDevice } from './native-device'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { androidSdkRoot } from '../react-native/native-toolchain'
import { buildCompatibilityBundle } from './build'
import { exampleDir, lynxIntermediateDir, repoRoot } from './catalog'
import { collectNativeEvidence, createEvidenceContext, validateNativeEvidence } from './evidence'
import { readPreparedIosBuildTarget } from './ios-build-target'
import { formatNativeFailure, withNativeArtifacts } from './native-artifacts'
import { command } from './native-command'
import { adbArgs, resolveNativeDevice } from './native-device'
import { enrichEnvironment } from './native-environment'
import { parseNativeRunArgs } from './native-options'
import { waitForReportOrFailure } from './native-report'
import { finalizeNativePixelEffects, validateNativePixelEvidence } from './pixel-evidence'
import { assertNativeConclusionsMatch } from './report-comparison'
import { defaultReportPath, validateNativeReport } from './reports'
import { runIos } from './run-ios'

const options = parseNativeRunArgs(process.argv.slice(2), process.cwd())
const platform: Platform = options.platform

const fixtureDir = path.join(repoRoot, 'e2e', 'fixtures', 'lynx-native', platform)
const applicationId = 'com.weapptailwindcss.lynxcompat'

async function wait(milliseconds: number) {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function collectAndroidArtifacts(source: string, artifactDir: string, device: AndroidDevice, context: NativeEvidenceContext) {
  await fs.writeFile(path.join(artifactDir, 'raw-report.json'), source)
  const report = JSON.parse(source) as NativePlatformReport
  await collectNativeEvidence(report, artifactDir, context, async (name) => {
    const devicePath = `files/lynx-compat/${context.runId}/artifacts/${name}`
    const result = await execa('adb', adbArgs(device, ['exec-out', 'run-as', applicationId, 'cat', devicePath]), { encoding: 'buffer' })
    return result.stdout
  })
}

async function collectAndroidLogcat(artifactDir: string, device: AndroidDevice) {
  const result = await execa('adb', adbArgs(device, ['logcat', '-d', '-t', '2500']), { all: true, encoding: 'utf8', reject: false })
  await fs.writeFile(path.join(artifactDir, 'logcat.txt'), result.all ?? result.stdout ?? result.stderr ?? '')
}

async function installedAndroidCompileSdk() {
  const sdkRoot = androidSdkRoot(process.env, process.platform, undefined, false)
  if (!sdkRoot) {
    return undefined
  }
  const entries = await fs.readdir(path.join(sdkRoot, 'platforms'), { withFileTypes: true }).catch(() => [])
  const versions = entries
    .filter(entry => entry.isDirectory())
    .map(entry => /^android-(\d+)$/.exec(entry.name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
  return versions.length > 0 ? Math.max(...versions) : undefined
}

async function recordAndroidVideo(hostDir: string, artifactDir: string, device: AndroidDevice) {
  const devicePath = '/sdcard/lynx-promo-capture.mp4'
  await execa('adb', adbArgs(device, ['shell', 'rm', '-f', devicePath]), { reject: false })
  const recording = execa('adb', adbArgs(device, ['shell', 'screenrecord', '--time-limit', String(options.captureDurationSeconds), '--bit-rate', '6000000', devicePath]), { reject: false })
  await wait(2600)
  await execa('adb', adbArgs(device, ['shell', 'input', 'swipe', '540', '1480', '540', '720', '700']), { reject: false })
  await wait(2200)
  await execa('adb', adbArgs(device, ['shell', 'input', 'swipe', '540', '760', '540', '1320', '650']), { reject: false })
  await recording
  await command('adb', adbArgs(device, ['pull', devicePath, path.join(artifactDir, 'raw.mp4')]), hostDir, 120_000)
  await execa('adb', adbArgs(device, ['shell', 'rm', '-f', devicePath]), { reject: false })
}

async function runAndroid(hostDir: string, artifactDir: string, device: AndroidDevice, context: NativeEvidenceContext) {
  await command('adb', adbArgs(device, ['get-state']), hostDir, 30_000)
  const compileSdk = await installedAndroidCompileSdk()
  const gradleArguments = ['--project-dir', hostDir, ':app:assembleDebug', '--stacktrace']
  if (compileSdk) {
    gradleArguments.push(`-PlynxCompileSdk=${compileSdk}`)
  }
  await command(process.env['LYNX_GRADLE'] ?? 'gradle', gradleArguments, hostDir)
  const apkPath = path.join(hostDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
  await command('adb', adbArgs(device, ['install', '-r', apkPath]), hostDir, 120_000)
  await command('adb', adbArgs(device, ['shell', 'am', 'force-stop', applicationId]), hostDir, 30_000)
  const hiddenErrorDialogs = (await command('adb', adbArgs(device, ['shell', 'settings', 'get', 'global', 'hide_error_dialogs']), hostDir, 30_000)).trim()
  await command('adb', adbArgs(device, ['shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1']), hostDir, 30_000)
  try {
    await execa('adb', adbArgs(device, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']), { reject: false })
    await execa('adb', adbArgs(device, ['shell', 'wm', 'dismiss-keyguard']), { reject: false })
    await execa('adb', adbArgs(device, ['shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS']), { reject: false })
    await execa('adb', adbArgs(device, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']), { reject: false })
    await command('adb', adbArgs(device, ['shell', 'am', 'start', '-W', '-n', `${applicationId}/.MainActivity`]), hostDir, 60_000)
    if (options.captureOnly) {
      await wait(2200)
      const screenshot = await execa('adb', adbArgs(device, ['exec-out', 'screencap', '-p']), { encoding: 'buffer', reject: false })
      if (screenshot.exitCode !== 0 || !screenshot.stdout) {
        throw new Error('Unable to capture the Android promo screenshot.')
      }
      await fs.writeFile(path.join(artifactDir, 'screen.png'), screenshot.stdout)
      await recordAndroidVideo(hostDir, artifactDir, device)
      return undefined
    }
    const report = await waitForReportOrFailure(async () => {
      const result = await execa('adb', adbArgs(device, ['shell', 'run-as', applicationId, 'cat', `files/lynx-compat/${context.runId}/report.json`]), { reject: false })
      return result.exitCode === 0 && result.stdout.trim().startsWith('{') ? result.stdout : undefined
    }, async () => {
      const result = await execa('adb', adbArgs(device, ['shell', 'run-as', applicationId, 'cat', `files/lynx-compat/${context.runId}/failure.json`]), { reject: false })
      return result.exitCode === 0 ? result.stdout : undefined
    })
    const screenshotPath = path.join(artifactDir, 'screen.png')
    const screenshot = await execa('adb', adbArgs(device, ['exec-out', 'screencap', '-p']), { encoding: 'buffer', reject: false })
    if (screenshot.exitCode === 0 && screenshot.stdout) {
      await fs.writeFile(screenshotPath, screenshot.stdout)
    }
    await collectAndroidArtifacts(report, artifactDir, device, context)
    return report
  }
  finally {
    await collectAndroidLogcat(artifactDir, device)
    const restoreArguments = hiddenErrorDialogs === 'null'
      ? ['shell', 'settings', 'delete', 'global', 'hide_error_dialogs']
      : ['shell', 'settings', 'put', 'global', 'hide_error_dialogs', hiddenErrorDialogs]
    await execa('adb', adbArgs(device, restoreArguments), { reject: false })
  }
}

async function compareCommittedReport(actual: NativePlatformReport) {
  const expectedPath = defaultReportPath(platform)
  const expected = await fs.readFile(expectedPath, 'utf8').then(source => JSON.parse(source) as NativePlatformReport).catch(() => undefined)
  if (!expected) {
    throw new Error(`缺少已提交的 ${platform} 报告：${path.relative(repoRoot, expectedPath)}`)
  }
  return assertNativeConclusionsMatch(actual, expected, { allowPendingCandidates: true })
}

async function main() {
  if (!options.captureOnly) {
    const { assertCurrentStaticEvidence } = await import('./static-report')
    const { default: staticEvidence } = await import('../../examples/react-lynx/src/compatibility/static-evidence.json')
    assertCurrentStaticEvidence(staticEvidence as import('../../examples/react-lynx/src/compatibility/types').StaticEvidenceReport)
  }
  const artifactDir = options.outputDir ?? path.join(repoRoot, 'e2e', '.artifacts', 'lynx-native', `${platform}-${Date.now()}`)
  return withNativeArtifacts(platform, artifactDir, async (setStage) => {
    const target = (platform === 'ios' ? await readPreparedIosBuildTarget(repoRoot) : undefined)
      ?? await resolveNativeDevice(platform, fixtureDir, process.env, { file: path.join(artifactDir, 'device-discovery-command.json') })
    setStage('host-preparation')
    const temporaryRoot = process.env['LYNX_NATIVE_WORK_DIR']
      ? path.resolve(process.env['LYNX_NATIVE_WORK_DIR'])
      : await fs.mkdtemp(path.join(os.tmpdir(), `weapp-tailwindcss-lynx-${platform}-`))
    const hostDir = path.join(temporaryRoot, 'host')
    await fs.cp(fixtureDir, hostDir, { recursive: true })
    await fs.writeFile(path.join(artifactDir, target.platform === 'ios' ? 'build-target.json' : 'device.json'), `${JSON.stringify(target, null, 2)}\n`)
    if (platform === 'ios' && process.env['LYNX_IOS_BUILD_TARGET_FILE']) {
      await fs.copyFile(process.env['LYNX_IOS_BUILD_TARGET_FILE'], path.join(artifactDir, 'build-target-manifest.json'))
    }
    setStage('bundle-build')
    const build = options.captureOnly ? undefined : await buildCompatibilityBundle()
    setStage('bundle-staging')
    const bundlePath = options.bundlePath ?? path.join(exampleDir, 'dist', 'main.lynx.bundle')
    const stagedBundle = platform === 'android'
      ? path.join(hostDir, 'app', 'src', 'main', 'assets', 'main.lynx.bundle')
      : path.join(hostDir, 'App', 'main.lynx.bundle')
    await fs.mkdir(path.dirname(stagedBundle), { recursive: true })
    const bundle = await fs.readFile(bundlePath)
    const context = createEvidenceContext(bundle, process.env['TAILWIND_E2E_RUN_ID'])
    const contextSource = `${JSON.stringify(context, null, 2)}\n`
    const stagedArtifacts = [
      fs.writeFile(stagedBundle, bundle),
      fs.writeFile(path.join(artifactDir, 'main.lynx.bundle'), bundle),
      fs.writeFile(path.join(artifactDir, 'run-context.json'), contextSource),
      fs.writeFile(path.join(path.dirname(stagedBundle), 'run-context.json'), contextSource),
    ]
    if (!options.captureOnly && build) {
      stagedArtifacts.push(
        fs.copyFile(path.join(lynxIntermediateDir, 'main.css'), path.join(artifactDir, 'main.css')),
        fs.copyFile(path.join(lynxIntermediateDir, 'tasm.json'), path.join(artifactDir, 'tasm.json')),
        fs.writeFile(path.join(artifactDir, 'encoder.log'), build.encoderLog),
      )
    }
    await Promise.all(stagedArtifacts)

    setStage('native-run')
    const execution = target.platform === 'android'
      ? { device: target, result: await runAndroid(hostDir, artifactDir, target, context) }
      : await runIos(hostDir, artifactDir, target, context, options, setStage)
    const { device, result: reportSource } = execution
    if (options.captureOnly) {
      process.stdout.write(`${JSON.stringify({ platform, artifactDir, captureDurationSeconds: options.captureDurationSeconds }, null, 2)}\n`)
      return
    }
    if (!reportSource) {
      throw new Error('Native compatibility run did not produce a report.')
    }
    setStage('report-validation')
    await fs.writeFile(path.join(artifactDir, 'raw-report.json'), `${reportSource.trim()}\n`)
    const raw = await enrichEnvironment(JSON.parse(reportSource) as NativePlatformReport, hostDir, device)
    const crops = await validateNativeEvidence(raw, artifactDir, context)
    const report = await finalizeNativePixelEffects(raw, crops)
    await fs.writeFile(path.join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    validateNativeReport(report, platform, { requireGeometryEvidence: true, requireCandidateEvidence: true, allowPendingCandidates: true })
    await validateNativePixelEvidence(report, crops)
    const pendingCandidates = await compareCommittedReport(report)
    process.stdout.write(`${JSON.stringify({ platform, artifactDir, cases: report.results.length, completion: pendingCandidates.length ? 'partial' : 'complete', pendingCandidates }, null, 2)}\n`)
  })
}

main().catch((error) => {
  process.stderr.write(`${formatNativeFailure(error)}\n`)
  process.exitCode = 1
})
