/* eslint-disable antfu/no-top-level-await, perfectionist/sort-imports, style/max-statements-per-line */

import type { Server } from 'node:http'
import type { NativeVisualProbe } from '../../examples/react-native-expo/src/visual-probes'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import os from 'node:os'
import { execa } from 'execa'
import { PNG } from 'pngjs'
import { assessNativeScreenshot } from './native-screenshot'
import type { ReactNativePlatform, ReactNativeReport } from './catalog'
import { androidExpoDevice } from './android-device'
import { androidScreenProbes, findAndroidAnrWaitTap } from './android-window'
import { getHttpText } from './native-http'
import { createIosLaunchReconciler } from './ios-launch'
import { createExpoNativeEnvironment } from './native-environment'
import { reactNativeAndroidToolchain } from './native-toolchain'
import { awaitNativeExitCompletion, canAcceptNativeReport, evaluateNativeWait } from './native-wait'
import { stopOwnedProcess } from './process'
import { createRuntimeArtifacts } from './runtime-artifacts'
import { validateReactNativeReport } from './reports'

interface ReportEnvelope { hmrMarker: string, cssHmrColor: string, report: ReactNativeReport, visualProbes: NativeVisualProbe[] }

interface ReportWaitOptions {
  cssHmrColor?: string
  recover?: () => Promise<void>
  reportTimeout?: number
  startupTimeout?: number
  reconcileLaunch?: () => Promise<void>
  requireLaunchCompletion?: boolean
}

const platform = process.argv[2] as ReactNativePlatform
if (platform !== 'android' && platform !== 'ios') { throw new Error('Usage: tsx e2e/react-native/run-native.ts <android|ios>') }

const repoRoot = path.resolve(import.meta.dirname, '../..')
const exampleRoot = path.resolve(repoRoot, 'examples/react-native-expo')
const artifactSession = await createRuntimeArtifacts(path.resolve(repoRoot, `e2e/.artifacts/react-native-${platform}`))
const artifacts = artifactSession.directory
const reportsDir = path.resolve(repoRoot, 'e2e/react-native/reports')
const markerFile = path.resolve(exampleRoot, 'src/hmr-marker.ts')
const cssFile = path.resolve(exampleRoot, 'global.css')
const metroLogPath = path.resolve(artifacts, 'metro.log')
const reports: ReportEnvelope[] = []
const updateBaseline = process.env['RN_UPDATE_BASELINE'] === '1'

function startReporter(host: string) {
  let server: Server
  const ready = new Promise<number>((resolve) => {
    server = createServer((request, response) => {
      if (request.method !== 'POST') { response.writeHead(404).end(); return }
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        try {
          reports.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ReportEnvelope)
          response.writeHead(204).end()
        }
        catch (error) {
          response.writeHead(400).end(String(error))
        }
      })
    })
    server.listen(0, host, () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
  return { ready, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

async function waitForMetro(metro: ReturnType<typeof execa>, timeout = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (typeof metro.exitCode === 'number') { throw new TypeError(`Metro exited with code ${metro.exitCode}; see ${path.resolve(artifacts, 'metro.log')}`) }
    try {
      if ((await getHttpText('http://127.0.0.1:8081/status')).includes('packager-status:running')) { return }
    }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for Metro on port 8081')
}

async function waitForReportOrExit(marker: string, run: ReturnType<typeof execa>, metro: ReturnType<typeof execa>, options: ReportWaitOptions = {}) {
  const {
    cssHmrColor,
    recover,
    reportTimeout = 240_000,
    startupTimeout = reportTimeout,
    reconcileLaunch,
    requireLaunchCompletion = false,
  } = options
  const started = Date.now()
  let runCompletedAt: number | undefined
  let bundleCompletedAt: number | undefined
  let recovered = false
  while (true) {
    const now = Date.now()
    const envelope = reports.find(item => item.hmrMarker === marker && (!cssHmrColor || item.cssHmrColor === cssHmrColor))
    let launchReconciled = false
    if (typeof run.exitCode === 'number' && run.exitCode !== 0) {
      if (!reconcileLaunch) { throw new TypeError(`expo run:${platform} exited with code ${run.exitCode}; see ${path.resolve(artifacts, 'expo-run.log')}`) }
      // 等待 Expo 输出流结束后核对首个错误；HMR 使用同一已核对的启动结果。
      await awaitNativeExitCompletion(run, startupTimeout - (Date.now() - started))
      await reconcileLaunch()
      launchReconciled = true
    }
    if (envelope && canAcceptNativeReport(run.exitCode, launchReconciled, requireLaunchCompletion)) { return envelope }
    if ((run.exitCode === 0 || launchReconciled) && !runCompletedAt) { runCompletedAt = now }
    if (recover && runCompletedAt && !recovered && !launchReconciled) {
      if (!bundleCompletedAt) {
        const metroLog = await fs.readFile(metroLogPath, 'utf8').catch(() => '')
        if (metroLog.includes(`${platform === 'ios' ? 'iOS' : 'Android'} Bundled`)) { bundleCompletedAt = now }
      }
      const state = evaluateNativeWait({
        bundleCompletedAt,
        now,
        recovered,
        recoveryDelay: 180_000,
        reportTimeout,
        runCompletedAt,
        startedAt: started,
        startupTimeout,
      })
      if (state.shouldRecover) {
        await recover()
        recovered = true
        runCompletedAt = Date.now()
      }
    }
    if (typeof metro.exitCode === 'number') { throw new TypeError(`Metro exited with code ${metro.exitCode}; see ${path.resolve(artifacts, 'metro.log')}`) }
    const state = evaluateNativeWait({
      bundleCompletedAt,
      now,
      recovered,
      recoveryDelay: 180_000,
      reportTimeout,
      runCompletedAt,
      startedAt: started,
      startupTimeout,
    })
    if (state.timedOut) {
      throw new Error(`Timed out waiting for ${platform} ${state.phase} marker=${marker} css=${cssHmrColor ?? 'any'}`)
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

async function fileHash(file: string) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex')
}

async function capture(name: string, device: string) {
  const output = path.resolve(artifacts, name)
  if (platform === 'android') {
    const result = await execa('adb', ['-s', device, 'exec-out', 'screencap', '-p'], { encoding: 'buffer' })
    await fs.writeFile(output, result.stdout)
  }
  else {
    await execa('xcrun', ['simctl', 'io', device, 'screenshot', output])
  }
  const stat = await fs.stat(output)
  if (stat.size < 1024) { throw new Error(`${platform} screenshot is unexpectedly small: ${stat.size}`) }
  return output
}

/** 运行时报告只证明 JS 状态；连续两帧的实测像素通过后才接受原生截图。 */
async function captureVerified(name: string, device: string, envelope: ReportEnvelope) {
  const started = Date.now()
  const attempts: Array<{ elapsedMs: number, assessment: ReturnType<typeof assessNativeScreenshot> }> = []
  let consecutive = 0
  let probes = envelope.visualProbes
  if (platform === 'android') {
    await execa('adb', ['-s', device, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'])
    const window = await execa('adb', ['-s', device, 'exec-out', 'cat', '/sdcard/window.xml'])
    await fs.writeFile(path.resolve(artifacts, `${name}.window.xml`), window.stdout)
    probes = androidScreenProbes(window.stdout, probes, envelope.report.environment.viewport.pixelRatio, envelope.hmrMarker, envelope.cssHmrColor)
  }
  try {
    while (Date.now() - started < 30_000) {
      const file = await capture(name, device)
      const png = PNG.sync.read(await fs.readFile(file))
      const assessment = assessNativeScreenshot(png, probes, envelope.report.environment.viewport.pixelRatio)
      attempts.push({ elapsedMs: Date.now() - started, assessment })
      consecutive = assessment.passed ? consecutive + 1 : 0
      if (consecutive >= 2) { return file }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error(`Native screenshot did not match current runtime probes: ${name}; ${JSON.stringify(attempts.at(-1))}`)
  }
  finally {
    await fs.writeFile(path.resolve(artifacts, `${name}.visual.json`), `${JSON.stringify({ probes, runtimeProbes: envelope.visualProbes, attempts }, null, 2)}\n`)
  }
}

async function captureFailureDiagnostics(device: string) {
  if (platform === 'android') {
    const logcat = await execa('adb', ['-s', device, 'logcat', '-d', '-v', 'threadtime'], { reject: false })
    await fs.writeFile(path.resolve(artifacts, 'logcat.txt'), logcat.stdout, 'utf8')
    const dumpResult = await execa('adb', ['-s', device, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'], { reject: false })
    if (dumpResult.exitCode === 0) {
      const window = await execa('adb', ['-s', device, 'exec-out', 'cat', '/sdcard/window.xml'], { reject: false })
      await fs.writeFile(path.resolve(artifacts, 'window-failure.xml'), window.stdout, 'utf8')
    }
  }
  else {
    const simulatorLog = await execa('xcrun', [
      'simctl',
      'spawn',
      device,
      'log',
      'show',
      '--style',
      'compact',
      '--last',
      '30m',
      '--predicate',
      'process == "weapptailwindcssRN" OR subsystem BEGINSWITH "com.facebook.react" OR eventMessage CONTAINS "com.weapptailwindcss.rncompat"',
    ], { reject: false })
    await fs.writeFile(path.resolve(artifacts, 'simulator.log'), `${simulatorLog.stdout}\n${simulatorLog.stderr}`, 'utf8')
  }
  try { await capture('failure.png', device) }
  catch { /* 设备未启动时没有可用截图。 */ }
}

async function relaunchRuntime(device: string, metroHost: string) {
  const appId = 'com.weapptailwindcss.rncompat'
  const url = `${appId}://expo-development-client/?url=${encodeURIComponent(`http://${metroHost}:8081`)}`
  if (platform === 'android') {
    await execa('adb', ['-s', device, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS'], { reject: false })
    await execa('adb', ['-s', device, 'shell', 'am', 'force-stop', appId], { reject: false })
    await execa('adb', ['-s', device, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url], { reject: false })
    return
  }
  await execa('xcrun', ['simctl', 'terminate', device, appId], { reject: false })
  await execa('xcrun', ['simctl', 'openurl', device, url])
}

function iosHostAddress() {
  const configured = process.env['RN_IOS_HOST']
  if (configured) { return configured }
  const interfaces = os.networkInterfaces()
  const candidates = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter(address => address.family === 'IPv4' && !address.internal)
      .map(address => ({ name, address: address.address })),
  )
  return candidates.find(candidate => candidate.name === 'en0')?.address
    ?? candidates[0]?.address
    ?? '127.0.0.1'
}

async function assertAndroidMarker(device: string, marker: string) {
  const dump = path.resolve(artifacts, 'window.xml')
  for (let attempt = 0; attempt < 3; attempt++) {
    await execa('adb', ['-s', device, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'])
    const result = await execa('adb', ['-s', device, 'exec-out', 'cat', '/sdcard/window.xml'])
    await fs.writeFile(dump, result.stdout, 'utf8')
    if (result.stdout.includes(marker) && result.stdout.includes('tw-rn-root')) { return }
    const waitTap = findAndroidAnrWaitTap(result.stdout)
    if (!waitTap) { break }
    await execa('adb', ['-s', device, 'shell', 'input', 'tap', String(waitTap.x), String(waitTap.y)])
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error(`Android accessibility tree is missing ${marker} or tw-rn-root`)
}

function startAndroidDialogGuard(device: string) {
  let dismissing = false
  const timer = setInterval(() => {
    if (dismissing) { return }
    dismissing = true
    void execa('adb', ['-s', device, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS'], { reject: false })
      .finally(() => { dismissing = false })
  }, 10_000)
  return () => clearInterval(timer)
}

async function collectNativeEnvironment(device: string): Promise<Partial<ReactNativeReport['environment']>> {
  if (platform === 'android') {
    const [model, abi, release, sdk] = await Promise.all([
      execa('adb', ['-s', device, 'shell', 'getprop', 'ro.product.model']),
      execa('adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']),
      execa('adb', ['-s', device, 'shell', 'getprop', 'ro.build.version.release']),
      execa('adb', ['-s', device, 'shell', 'getprop', 'ro.build.version.sdk']),
    ])
    return {
      deviceName: model.stdout.trim(),
      osVersion: `${release.stdout.trim()} (API ${sdk.stdout.trim()})`,
      abi: abi.stdout.trim(),
    }
  }
  const [devices, modelIdentifier, abi] = await Promise.all([
    execa('xcrun', ['simctl', 'list', 'devices', 'available', '-j']),
    execa('xcrun', ['simctl', 'getenv', device, 'SIMULATOR_MODEL_IDENTIFIER'], { reject: false }),
    execa('xcrun', ['simctl', 'spawn', device, '/usr/bin/uname', '-m']),
  ])
  const parsed = JSON.parse(devices.stdout) as { devices: Record<string, Array<{ name: string, udid: string }>> }
  const simulator = Object.values(parsed.devices).flat().find(item => item.udid === device)
  const model = modelIdentifier.stdout.trim()
  return {
    deviceName: `${simulator?.name ?? 'iOS Simulator'}${model ? ` (${model})` : ''}`,
    abi: abi.stdout.trim(),
  }
}

function withNativeEnvironment(report: ReactNativeReport, environment: Partial<ReactNativeReport['environment']>) {
  return { ...report, environment: { ...report.environment, ...environment } }
}

async function main() {
  const toolchain = platform === 'android' ? await reactNativeAndroidToolchain() : undefined
  await fs.rm(artifacts, { recursive: true, force: true })
  await fs.mkdir(artifacts, { recursive: true })
  if (updateBaseline) { await fs.mkdir(reportsDir, { recursive: true }) }
  const originalMarker = await fs.readFile(markerFile, 'utf8')
  const originalCss = await fs.readFile(cssFile, 'utf8')
  const runtimeHost = platform === 'ios' ? iosHostAddress() : '127.0.0.1'
  const device = platform === 'android'
    ? process.env['RN_ANDROID_DEVICE_ID'] ?? 'emulator-5554'
    : process.env['RN_IOS_DEVICE_ID'] ?? (await execa('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'])).stdout.match(/"udid"\s*:\s*"([^"]+)"/)?.[1] ?? ''
  if (!device) { throw new TypeError(`No booted ${platform} simulator was found`) }
  const expoDevice = platform === 'android' ? await androidExpoDevice(device) : device
  const nativeEnvironment = await collectNativeEnvironment(device)
  const reporter = startReporter(platform === 'ios' ? '0.0.0.0' : runtimeHost)
  const port = await reporter.ready
  const reportUrl = `http://${runtimeHost}:${port}`
  let stopAndroidDialogGuard: (() => void) | undefined
  if (platform === 'android') {
    await execa('adb', ['-s', device, 'reverse', `tcp:${port}`, `tcp:${port}`])
    await execa('adb', ['-s', device, 'reverse', 'tcp:8081', 'tcp:8081'])
    await execa('adb', ['-s', device, 'shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1'])
    await execa('adb', ['-s', device, 'shell', 'settings', 'put', 'global', 'anr_show_background', '0'])
    await execa('adb', ['-s', device, 'shell', 'settings', 'put', 'global', 'show_first_crash_dialog', '0'])
    await execa('adb', ['-s', device, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS'], { reject: false })
    await execa('adb', ['-s', device, 'logcat', '-c'], { reject: false })
    stopAndroidDialogGuard = startAndroidDialogGuard(device)
  }
  const logFile = await fs.open(path.resolve(artifacts, 'expo-run.log'), 'w')
  const metroLogFile = await fs.open(metroLogPath, 'w')
  const javaHome = toolchain?.javaHome
  const androidHome = toolchain?.sdk
  const env: NodeJS.ProcessEnv = {
    ...createExpoNativeEnvironment(runtimeHost, reportUrl),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ...(platform === 'android' ? { ANDROID_HOME: androidHome } : {}),
  }
  if (javaHome) { env['PATH'] = `${path.join(javaHome, 'bin')}${path.delimiter}${process.env['PATH'] ?? ''}` }
  // iOS Simulator 与宿主机共享网络栈时使用 localhost，避免 CI 的虚拟网卡地址无法被 simctl openurl 访问。
  const metroHost = platform === 'ios' && runtimeHost !== '127.0.0.1' ? '--lan' : '--localhost'
  const metro = execa('pnpm', ['--filter', '@weapp-tailwindcss/example-react-native-expo', 'exec', 'expo', 'start', metroHost, '--port', '8081', '--clear'], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env,
    stdout: metroLogFile.createWriteStream(),
    stderr: metroLogFile.createWriteStream(),
    reject: false,
  })
  let run: ReturnType<typeof execa> | undefined
  let completed = false
  try {
    await waitForMetro(metro)
    const runArgs = ['--filter', '@weapp-tailwindcss/example-react-native-expo', 'exec', 'expo', 'run', platform === 'android' ? 'android' : 'ios', '--no-bundler']
    runArgs.push('--device', expoDevice)
    if (platform === 'android' && process.env['RN_ANDROID_BINARY']) {
      runArgs.push('--binary', path.resolve(repoRoot, process.env['RN_ANDROID_BINARY']))
    }
    const reconcileLaunch = platform === 'ios'
      ? createIosLaunchReconciler({
          device,
          url: `com.weapptailwindcss.rncompat://expo-development-client/?url=${encodeURIComponent(`http://${runtimeHost}:8081`)}`,
          artifacts,
          deadline: Date.now() + 1_800_000,
        })
      : undefined
    run = execa('pnpm', runArgs, {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      env,
      stdout: logFile.createWriteStream(),
      stderr: logFile.createWriteStream(),
      reject: false,
    })
    // 首次原生构建包含 CocoaPods/Gradle 依赖准备，不能使用 HMR 的短超时。
    const baseline = await waitForReportOrExit('rn-hmr-baseline', run, metro, {
      cssHmrColor: '#10b981',
      recover: () => relaunchRuntime(device, runtimeHost),
      reportTimeout: 300_000,
      startupTimeout: 1_800_000,
      reconcileLaunch,
      requireLaunchCompletion: true,
    })
    const baselineReport = withNativeEnvironment(baseline.report, nativeEnvironment)
    validateReactNativeReport(baselineReport, platform)
    if (platform === 'android') { await assertAndroidMarker(device, 'rn-hmr-baseline') }
    const beforeScreenshot = await captureVerified('runtime-before.png', device, baseline)

    const updated = originalMarker.replace('rn-hmr-baseline', 'rn-hmr-updated').replace('bg-emerald-500', 'bg-rose-500')
    await fs.writeFile(markerFile, updated, 'utf8')
    const hmr = await waitForReportOrExit('rn-hmr-updated', run, metro, { cssHmrColor: '#10b981', reportTimeout: 120_000, reconcileLaunch })
    const hmrReport = withNativeEnvironment(hmr.report, nativeEnvironment)
    validateReactNativeReport(hmrReport, platform)
    if (platform === 'android') { await assertAndroidMarker(device, 'rn-hmr-updated') }
    const afterTsxScreenshot = await captureVerified('runtime-tsx-after.png', device, hmr)
    const updatedCss = originalCss.replace('#10b981', '#f59e0b')
    if (updatedCss === originalCss) { throw new Error('CSS HMR probe color was not found') }
    await fs.writeFile(cssFile, updatedCss, 'utf8')
    const cssHmr = await waitForReportOrExit('rn-hmr-updated', run, metro, { cssHmrColor: '#f59e0b', reportTimeout: 120_000, reconcileLaunch })
    const cssHmrReport = withNativeEnvironment(cssHmr.report, nativeEnvironment)
    validateReactNativeReport(cssHmrReport, platform)
    if (platform === 'android') { await assertAndroidMarker(device, 'rn-hmr-updated') }
    const afterScreenshot = await captureVerified('runtime-after.png', device, cssHmr)
    const beforeHash = await fileHash(beforeScreenshot)
    const afterTsxHash = await fileHash(afterTsxScreenshot)
    const afterHash = await fileHash(afterScreenshot)
    if (beforeHash === afterTsxHash) { throw new Error(`${platform} TSX HMR screenshot did not change`) }
    if (afterTsxHash === afterHash) { throw new Error(`${platform} CSS HMR screenshot did not change`) }
    await fs.writeFile(path.resolve(artifacts, 'report-before.json'), `${JSON.stringify(baselineReport, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.resolve(artifacts, 'report.json'), `${JSON.stringify(cssHmrReport, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.resolve(artifacts, 'hmr.json'), `${JSON.stringify({
      beforeMarker: baseline.hmrMarker,
      afterTsxMarker: hmr.hmrMarker,
      beforeCssColor: hmr.cssHmrColor,
      afterCssColor: cssHmr.cssHmrColor,
      beforeScreenshotHash: beforeHash,
      afterTsxScreenshotHash: afterTsxHash,
      afterScreenshotHash: afterHash,
    }, null, 2)}\n`, 'utf8')
    if (updateBaseline) {
      await fs.writeFile(path.resolve(reportsDir, `${platform}.json`), `${JSON.stringify(cssHmrReport, null, 2)}\n`, 'utf8')
    }
    completed = true
  }
  finally {
    stopAndroidDialogGuard?.()
    if (!completed) { await captureFailureDiagnostics(device) }
    await fs.writeFile(markerFile, originalMarker, 'utf8')
    await fs.writeFile(cssFile, originalCss, 'utf8')
    await stopOwnedProcess(run)
    await run?.catch(() => undefined)
    await stopOwnedProcess(metro)
    await metro.catch(() => undefined)
    await logFile.close()
    await metroLogFile.close()
    await reporter.close()
    if (platform === 'android') {
      await execa('adb', ['-s', device, 'reverse', '--remove', `tcp:${port}`], { reject: false })
      await execa('adb', ['-s', device, 'reverse', '--remove', 'tcp:8081'], { reject: false })
    }
  }
}

try {
  await main()
}
finally {
  await artifactSession.publish()
}
