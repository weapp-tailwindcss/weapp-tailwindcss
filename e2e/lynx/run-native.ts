import type { NativePlatformReport, Platform } from '../../examples/react-lynx/src/compatibility/types'
import type { AndroidDevice, IosDevice } from './native-device'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { androidSdkRoot } from '../react-native/native-toolchain'
import { buildCompatibilityBundle } from './build'
import { exampleDir, lynxIntermediateDir, repoRoot } from './catalog'
import { resolveIosAppContainer } from './ios-container'
import { command } from './native-command'
import { adbArgs, resolveNativeDevice } from './native-device'
import { enrichEnvironment } from './native-environment'
import { iosPodInstallArguments, parseNativeRunArgs } from './native-options'
import { defaultReportPath, nativeReportConclusion, validateNativeReport } from './reports'

const options = parseNativeRunArgs(process.argv.slice(2), process.cwd())
const platform: Platform = options.platform

const fixtureDir = path.join(repoRoot, 'e2e', 'fixtures', 'lynx-native', platform)
const applicationId = 'com.weapptailwindcss.lynxcompat'

async function wait(milliseconds: number) {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForReport(read: () => Promise<string | undefined>) {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const source = await read()
    if (source) {
      return source
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for the native compatibility report.')
}

async function collectAndroidArtifacts(artifactDir: string, device: AndroidDevice) {
  const directory = 'files/lynx-compat/artifacts'
  const listing = await execa('adb', adbArgs(device, ['shell', 'run-as', applicationId, 'ls', directory]), { reject: false })
  if (listing.exitCode !== 0) {
    return
  }
  const outputDir = path.join(artifactDir, 'crops')
  await fs.mkdir(outputDir, { recursive: true })
  for (const name of listing.stdout.split(/\r?\n/).filter(name => /^[a-z0-9-]+\.png$/.test(name))) {
    const result = await execa('adb', adbArgs(device, ['exec-out', 'run-as', applicationId, 'cat', `${directory}/${name}`]), { encoding: 'buffer', reject: false })
    if (result.exitCode === 0 && result.stdout) {
      await fs.writeFile(path.join(outputDir, name), result.stdout)
    }
  }
}

async function collectAndroidLogcat(artifactDir: string, device: AndroidDevice) {
  const result = await execa('adb', adbArgs(device, ['logcat', '-d', '-t', '2500']), { all: true, encoding: 'utf8', reject: false })
  await fs.writeFile(path.join(artifactDir, 'logcat.txt'), result.all ?? result.stdout ?? result.stderr ?? '')
}

async function collectIosArtifacts(container: string, artifactDir: string) {
  const source = path.join(container, 'Library', 'Application Support', 'lynx-compat', 'artifacts')
  await fs.cp(source, path.join(artifactDir, 'crops'), { recursive: true }).catch(() => undefined)
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

async function runAndroid(hostDir: string, artifactDir: string, device: AndroidDevice) {
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
  await execa('adb', adbArgs(device, ['shell', 'run-as', applicationId, 'rm', '-f', 'files/lynx-compat/report.json']), { reject: false })
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
    const report = await waitForReport(async () => {
      const result = await execa('adb', adbArgs(device, ['shell', 'run-as', applicationId, 'cat', 'files/lynx-compat/report.json']), { reject: false })
      return result.exitCode === 0 && result.stdout.trim().startsWith('{') ? result.stdout : undefined
    })
    const screenshotPath = path.join(artifactDir, 'screen.png')
    const screenshot = await execa('adb', adbArgs(device, ['exec-out', 'screencap', '-p']), { encoding: 'buffer', reject: false })
    if (screenshot.exitCode === 0 && screenshot.stdout) {
      await fs.writeFile(screenshotPath, screenshot.stdout)
    }
    await collectAndroidArtifacts(artifactDir, device)
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

async function recordIosVideo(deviceId: string, artifactDir: string) {
  const output = path.join(artifactDir, 'raw.mp4')
  const recording = execa('xcrun', ['simctl', 'io', deviceId, 'recordVideo', '--codec=h264', output], { reject: false })
  await wait(options.captureDurationSeconds * 1000)
  recording.kill('SIGINT')
  await recording
}

async function runIos(hostDir: string, artifactDir: string, device: IosDevice) {
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
  const deviceId = device.id
  await command('xcrun', ['simctl', 'bootstatus', deviceId, '-b'], hostDir, 120_000)
  const derivedData = path.join(hostDir, 'DerivedData')
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
    device.destination,
    '-derivedDataPath',
    derivedData,
    'COMPILER_INDEX_STORE_ENABLE=NO',
    'build',
  ], hostDir, 1_800_000)
  const appPath = path.join(derivedData, 'Build', 'Products', 'Debug-iphonesimulator', 'LynxCompatibilityHost.app')
  await command('xcrun', ['simctl', 'install', deviceId, appPath], hostDir, 120_000)
  const container = await resolveIosAppContainer(deviceId, applicationId, hostDir, async (error) => {
    const detail = error instanceof Error ? error.stack : String(error)
    await fs.writeFile(path.join(artifactDir, 'container-query-timeout.txt'), `${detail}\n`)
    process.stderr.write('iOS 应用容器查询超时；已保留原始错误，等待指定模拟器就绪后仅再查询一次。\n')
  })
  const reportPath = path.join(container, 'Library', 'Application Support', 'lynx-compat', 'report.json')
  await fs.rm(reportPath, { force: true })
  await command('xcrun', ['simctl', 'launch', '--terminate-running-process', deviceId, applicationId], hostDir, 60_000)
  if (options.captureOnly) {
    await wait(2200)
    await command('xcrun', ['simctl', 'io', deviceId, 'screenshot', path.join(artifactDir, 'screen.png')], hostDir, 60_000)
    await recordIosVideo(deviceId, artifactDir)
    return undefined
  }
  const report = await waitForReport(async () => fs.readFile(reportPath, 'utf8').catch(() => undefined))
  await command('xcrun', ['simctl', 'io', deviceId, 'screenshot', path.join(artifactDir, 'screen.png')], hostDir, 60_000)
  await collectIosArtifacts(container, artifactDir)
  return report
}

async function compareCommittedReport(actual: NativePlatformReport) {
  const expectedPath = defaultReportPath(platform)
  const expected = await fs.readFile(expectedPath, 'utf8').then(source => JSON.parse(source) as NativePlatformReport).catch(() => undefined)
  if (!expected) {
    throw new Error(`缺少已提交的 ${platform} 报告：${path.relative(repoRoot, expectedPath)}`)
  }
  if (JSON.stringify(nativeReportConclusion(actual)) !== JSON.stringify(nativeReportConclusion(expected))) {
    throw new Error(`${platform} 运行时结论与已提交报告不一致，请审查 artifact 后显式刷新双端基线。`)
  }
}

async function main() {
  const device = await resolveNativeDevice(platform, fixtureDir)
  const temporaryRoot = process.env['LYNX_NATIVE_WORK_DIR']
    ? path.resolve(process.env['LYNX_NATIVE_WORK_DIR'])
    : await fs.mkdtemp(path.join(os.tmpdir(), `weapp-tailwindcss-lynx-${platform}-`))
  const hostDir = path.join(temporaryRoot, 'host')
  const artifactDir = options.outputDir ?? path.join(repoRoot, 'e2e', '.artifacts', 'lynx-native', `${platform}-${Date.now()}`)
  await Promise.all([
    fs.cp(fixtureDir, hostDir, { recursive: true }),
    fs.mkdir(artifactDir, { recursive: true }),
  ])
  await fs.writeFile(path.join(artifactDir, 'device.json'), `${JSON.stringify(device, null, 2)}\n`)
  const build = options.captureOnly ? undefined : await buildCompatibilityBundle()
  const bundlePath = options.bundlePath ?? path.join(exampleDir, 'dist', 'main.lynx.bundle')
  const stagedBundle = platform === 'android'
    ? path.join(hostDir, 'app', 'src', 'main', 'assets', 'main.lynx.bundle')
    : path.join(hostDir, 'App', 'main.lynx.bundle')
  await fs.mkdir(path.dirname(stagedBundle), { recursive: true })
  const stagedArtifacts = [
    fs.copyFile(bundlePath, stagedBundle),
    fs.copyFile(bundlePath, path.join(artifactDir, 'main.lynx.bundle')),
  ]
  if (!options.captureOnly && build) {
    stagedArtifacts.push(
      fs.copyFile(path.join(lynxIntermediateDir, 'main.css'), path.join(artifactDir, 'main.css')),
      fs.writeFile(path.join(artifactDir, 'encoder.log'), build.encoderLog),
    )
  }
  await Promise.all(stagedArtifacts)

  try {
    const reportSource = device.platform === 'android'
      ? await runAndroid(hostDir, artifactDir, device)
      : await runIos(hostDir, artifactDir, device)
    if (options.captureOnly) {
      process.stdout.write(`${JSON.stringify({ platform, artifactDir, captureDurationSeconds: options.captureDurationSeconds }, null, 2)}\n`)
      return
    }
    if (!reportSource) {
      throw new Error('Native compatibility run did not produce a report.')
    }
    await fs.writeFile(path.join(artifactDir, 'raw-report.json'), `${reportSource.trim()}\n`)
    const report = validateNativeReport(await enrichEnvironment(JSON.parse(reportSource) as NativePlatformReport, hostDir, device), platform)
    await fs.writeFile(path.join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    await compareCommittedReport(report)
    process.stdout.write(`${JSON.stringify({ platform, artifactDir, cases: report.results.length }, null, 2)}\n`)
  }
  catch (error) {
    await fs.writeFile(path.join(artifactDir, 'failure.txt'), `${error instanceof Error ? error.stack : String(error)}\n`)
    throw error
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
