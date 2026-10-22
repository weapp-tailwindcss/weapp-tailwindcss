/* eslint-disable antfu/no-top-level-await, perfectionist/sort-imports, style/max-statements-per-line */

import { captureNativePhase } from './phase-evidence'
import { EnvironmentBlockedError, environmentFailure } from '../tailwind-capabilities/environment-block'
import { runStageProducer } from '../tailwind-capabilities/stage-receipt'
import type { Server } from 'node:http'
import type { NativeVisualProbe } from '../../examples/react-native-expo/src/visual-probes'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import os from 'node:os'
import { execa } from 'execa'
import { PNG } from 'pngjs'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { assessNativeScreenshot } from './native-screenshot'
import type { ReactNativePlatform, ReactNativeReport } from './catalog'
import { androidExpoDevice } from './android-device'
import { createAndroidEnvironment } from './android-environment'
import { androidPairCoordinates, androidScreenProbes, findAndroidAnrWaitTap } from './android-window'
import { getHttpText } from './native-http'
import { captureMetroEvidence } from './metro-evidence'
import { createExpoNativeEnvironment } from './native-environment'
import { reactNativeAndroidToolchain } from './native-toolchain'
import { awaitNativeExitCompletion, canAcceptNativeReport, evaluateNativeWait } from './native-wait'
import { stopOwnedProcess } from './process'
import { createRuntimeArtifacts, runtimeArtifactIdentity } from './runtime-artifacts'
import { validateReactNativeReport } from './reports'
import { reactNativeVersions, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './catalog'
import { captureNativePair, validateNativeArtifacts } from './pair-evidence'
import { closeCaptureReporter, publishAfterCapture } from './capture-cleanup'
import { createNativeDiagnosticWriter } from './failure-diagnostics'
import { createSemanticReporter } from './semantic-reporter'
import { executeIosCommand } from './ios-command'
import { launchIosRuntime } from './ios-runtime'
import { readRuntimePublication } from './installation-evidence'
import { prepareMetroHttpObservation } from './http-observation'
import type { HmrObservationSnapshot } from '../../examples/react-native-expo/src/compatibility/hmr-observation.cjs'
import { archiveHmrSnapshot, prepareMetroHmrObservation, validateNativeHmrObservations } from './hmr-observation/evidence'

interface ReportEnvelope { hmrMarker: string, cssHmrColor: string, report: ReactNativeReport, visualProbes: NativeVisualProbe[], hmrObservation: HmrObservationSnapshot }
type NativeProcess = ReturnType<typeof startExpo>

interface ReportWaitOptions {
  cssHmrColor?: string
  recover?: () => Promise<void>
  reportTimeout?: number
  startupTimeout?: number
  reconcileLaunch?: (() => Promise<void>) | undefined
  requireLaunchCompletion?: boolean
}

const platform = process.argv[2] as ReactNativePlatform
if (platform !== 'android' && platform !== 'ios') { throw new Error('Usage: tsx e2e/react-native/run-native.ts <android|ios>') }

const repoRoot = path.resolve(import.meta.dirname, '../..')
const exampleRoot = path.resolve(repoRoot, 'examples/react-native-expo')
const runId = process.env['TAILWIND_E2E_RUN_ID'] ?? randomUUID()
const artifactSession = await createRuntimeArtifacts(path.resolve(repoRoot, `e2e/.artifacts/react-native-${platform}`), runtimeArtifactIdentity('react-native', `react-native-${platform}`, runId))
const artifacts = artifactSession.directory
const reportsDir = path.resolve(repoRoot, 'e2e/react-native/reports/v2')
const markerFile = path.resolve(exampleRoot, 'src/hmr-marker.ts')
const cssFile = path.resolve(exampleRoot, 'global.css')
const metroLogPath = path.resolve(artifacts, 'metro.log')
const reports: ReportEnvelope[] = []
const updateBaseline = process.env['RN_UPDATE_BASELINE'] === '1'
const clientToken = randomUUID()
let semanticDevice = ''
const semanticReporter = createSemanticReporter<ReportEnvelope>({ runId, catalogHash: RN_CATALOG_HASH, fixtureHash: RN_FIXTURE_HASH, versions: reactNativeVersions() }, async (pair, cancelSignal) => {
  if (platform === 'android') {
    await execa('adb', ['-s', semanticDevice, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'], { cancelSignal, forceKillAfterDelay: 1_000 })
    const window = await execa('adb', ['-s', semanticDevice, 'exec-out', 'cat', '/sdcard/window.xml'], { cancelSignal, forceKillAfterDelay: 1_000 })
    pair = androidPairCoordinates(window.stdout, pair)
  }
  return captureNativePair(pair, { runId, artifacts, cancelSignal, capture: name => capture(name, semanticDevice, cancelSignal) })
}, {
  clientToken,
  diagnostic: createNativeDiagnosticWriter(artifacts),
  revision: 'rn-hmr-baseline-10b981',
  platform,
  publication: signal => readRuntimePublication(exampleRoot, signal),
  complete: async (envelope, signal) => {
    await archiveHmrSnapshot(artifacts, envelope.report, envelope.hmrObservation)
    signal.throwIfAborted()
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(envelope.report, null, 2)}\n`, { encoding: 'utf8', signal })
    signal.throwIfAborted()
    reports.push(envelope)
  },
})

function startReporter(host: string) {
  let server: Server
  const ready = new Promise<number>((resolve, reject) => {
    server = createServer((request, response) => {
      if (semanticReporter.handle(request, response)) {
        return
      }
      response.writeHead(404).end()
    })
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
  return { ready, close: () => closeCaptureReporter(server) }
}

function startExpo(args: string[], env: NodeJS.ProcessEnv, log: Awaited<ReturnType<typeof fs.open>>) {
  return execa('pnpm', args, {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env,
    stdout: log.createWriteStream(),
    stderr: log.createWriteStream(),
    reject: false,
  })
}

async function waitForMetro(metro: NativeProcess, timeout = 120_000) {
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

async function waitForReportOrExit(marker: string, run: NativeProcess, metro: NativeProcess, options: ReportWaitOptions = {}) {
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
  let captureStarted = semanticReporter.captureElapsed()
  while (true) {
    semanticReporter.assertReady()
    const now = Date.now()
    const envelope = reports.find(item => item.hmrMarker === marker && (!cssHmrColor || item.cssHmrColor === cssHmrColor))
    let launchReconciled = false
    if (typeof run.exitCode === 'number' && run.exitCode !== 0) {
      if (!reconcileLaunch) {
        const detail = await fs.readFile(path.resolve(artifacts, 'expo-run.log'), 'utf8')
        const reason = environmentFailure(detail)
        if (reason) { throw new EnvironmentBlockedError(`${platform} 环境故障：${reason}`) }
        throw new TypeError(`native run:${platform} exited with code ${run.exitCode}; see ${path.resolve(artifacts, 'expo-run.log')}`)
      }
      // 等待 Expo 输出流结束后核对首个错误；HMR 使用同一已核对的启动结果。
      await awaitNativeExitCompletion(run, startupTimeout - (Date.now() - started))
      await reconcileLaunch()
      launchReconciled = true
    }
    if (envelope && canAcceptNativeReport(run.exitCode, launchReconciled, requireLaunchCompletion)) { return envelope }
    if ((run.exitCode === 0 || launchReconciled) && !runCompletedAt) {
      runCompletedAt = now
      captureStarted = semanticReporter.captureElapsed()
    }
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
        hostCaptureElapsed: semanticReporter.captureElapsed() - captureStarted,
      })
      if (state.shouldRecover) {
        await recover()
        recovered = true
        runCompletedAt = Date.now()
        captureStarted = semanticReporter.captureElapsed()
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
      hostCaptureElapsed: semanticReporter.captureElapsed() - captureStarted,
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

async function capture(name: string, device: string, cancelSignal?: AbortSignal) {
  const output = path.resolve(artifacts, name)
  if (platform === 'android') {
    const result = await execa('adb', ['-s', device, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', cancelSignal, forceKillAfterDelay: 1_000 })
    cancelSignal?.throwIfAborted()
    await fs.writeFile(output, result.stdout, { signal: cancelSignal })
  }
  else {
    await execa('xcrun', ['simctl', 'io', device, 'screenshot', output], { cancelSignal, forceKillAfterDelay: 1_000 })
  }
  cancelSignal?.throwIfAborted()
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

async function captureFailureDiagnostics(device: string, logcatSince?: string) {
  await captureMetroEvidence(exampleRoot, path.join(artifacts, 'metro-failure'), { 'global.css': cssFile, 'hmr-marker.ts': markerFile })
    .catch(error => process.stderr.write(`Failed to preserve Metro compilation evidence: ${String(error)}\n`))
  if (platform === 'android') {
    const logcat = await execa('adb', ['-s', device, 'logcat', '-d', '-v', 'threadtime', ...(logcatSince ? ['-T', logcatSince] : [])], { reject: false })
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
  const launch = await launchIosRuntime({ device, bundleId: appId, metroUrl: `http://${metroHost}:8081`, project: exampleRoot }, executeIosCommand)
  await fs.writeFile(path.join(artifacts, 'ios-runtime-relaunch.json'), `${JSON.stringify(launch, null, 2)}\n`)
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

let restoreAfterCapture = async () => {}

async function main() {
  const toolchain = platform === 'android' ? await reactNativeAndroidToolchain() : undefined
  if (updateBaseline) { await fs.mkdir(reportsDir, { recursive: true }) }
  const originalMarker = await fs.readFile(markerFile, 'utf8')
  const originalCss = await fs.readFile(cssFile, 'utf8')
  const runtimeHost = platform === 'ios' ? iosHostAddress() : '127.0.0.1'
  const device = platform === 'android'
    ? process.env['RN_ANDROID_DEVICE_ID'] ?? 'emulator-5554'
    : process.env['RN_IOS_DEVICE_ID'] ?? (await execa('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'])).stdout.match(/"udid"\s*:\s*"([^"]+)"/)?.[1] ?? ''
  if (!device) { throw new TypeError(`No booted ${platform} simulator was found`) }
  semanticDevice = device
  const expoDevice = platform === 'android' ? await androidExpoDevice(device) : device
  const nativeEnvironment = await collectNativeEnvironment(device)
  const reporter = startReporter(platform === 'ios' ? '0.0.0.0' : runtimeHost)
  let androidEnvironment: ReturnType<typeof createAndroidEnvironment> | undefined
  let stopAndroidDialogGuard: (() => void) | undefined
  let logFile: Awaited<ReturnType<typeof fs.open>> | undefined
  let metroLogFile: Awaited<ReturnType<typeof fs.open>> | undefined
  let metro: NativeProcess | undefined
  let run: NativeProcess | undefined
  let httpObservation: Awaited<ReturnType<typeof prepareMetroHttpObservation>> | undefined
  let completed = false
  let markerChanged = false
  let cssChanged = false
  restoreAfterCapture = () => runWithCleanup(async () => {
    await runWithCleanup(async () => {
      if (markerChanged) { await fs.writeFile(markerFile, originalMarker, 'utf8') }
    }, async () => {
      if (cssChanged) { await fs.writeFile(cssFile, originalCss, 'utf8') }
    })
  }, async () => {
    await androidEnvironment?.restore()
  })
  await runWithCleanup(async () => {
    const port = await reporter.ready
    const reportUrl = `http://${runtimeHost}:${port}`
    androidEnvironment = platform === 'android'
      ? createAndroidEnvironment({ device, ports: [port, 8081], artifacts })
      : undefined
    if (androidEnvironment) {
      await androidEnvironment.prepare()
      await execa('adb', ['-s', device, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS'], { reject: false })
      stopAndroidDialogGuard = startAndroidDialogGuard(device)
    }
    logFile = await fs.open(path.resolve(artifacts, 'expo-run.log'), 'w')
    metroLogFile = await fs.open(metroLogPath, 'w')
    const javaHome = toolchain?.javaHome
    const androidHome = toolchain?.sdk
    const env: NodeJS.ProcessEnv = {
      ...createExpoNativeEnvironment(runtimeHost, reportUrl, clientToken),
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      ...(platform === 'android' ? { ANDROID_HOME: androidHome } : {}),
    }
    if (javaHome) { env['PATH'] = `${path.join(javaHome, 'bin')}${path.delimiter}${process.env['PATH'] ?? ''}` }
    // iOS Simulator 与宿主机共享网络栈时使用 localhost，避免 CI 虚拟网卡地址导致 Metro 连接失败。
    const metroHost = platform === 'ios' && runtimeHost !== '127.0.0.1' ? '--lan' : '--localhost'
    httpObservation = await prepareMetroHttpObservation(repoRoot, artifacts, reactNativeVersions())
    const session = JSON.parse(await fs.readFile(path.join(artifacts, 'runtime-session.json'), 'utf8'))
    const hmrEnvironment = await prepareMetroHmrObservation(repoRoot, artifacts, { runId: session.runId, invocationId: session.invocationId })
    const activeMetro = metro = startExpo(['--filter', '@weapp-tailwindcss/example-react-native-expo', 'exec', 'expo', 'start', metroHost, '--port', '8081', '--clear'], { ...env, ...httpObservation.environment, ...hmrEnvironment }, metroLogFile)
    await waitForMetro(activeMetro)
    const runArgs = platform === 'ios'
      ? ['exec', 'tsx', 'e2e/react-native/ios-build-cli.ts', device, `http://${runtimeHost}:8081`, artifacts]
      : ['--filter', '@weapp-tailwindcss/example-react-native-expo', 'exec', 'expo', 'run', 'android', '--no-bundler', '--device', expoDevice]
    if (platform === 'android' && process.env['RN_ANDROID_BINARY']) {
      runArgs.push('--binary', path.resolve(repoRoot, process.env['RN_ANDROID_BINARY']))
    }
    run = startExpo(runArgs, env, logFile)
    // 首次原生构建包含 CocoaPods/Gradle 依赖准备，不能使用 HMR 的短超时。
    const baseline = await waitForReportOrExit('rn-hmr-baseline', run, activeMetro, {
      cssHmrColor: '#10b981',
      recover: () => relaunchRuntime(device, runtimeHost),
      reportTimeout: 300_000,
      startupTimeout: 1_800_000,
      requireLaunchCompletion: true,
    })
    const baselineReport = withNativeEnvironment(baseline.report, nativeEnvironment)
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(baselineReport, null, 2)}\n`, 'utf8')
    semanticReporter.assertReceipts(baselineReport)
    validateReactNativeReport(baselineReport, platform, { runId, revision: 'rn-hmr-baseline-10b981' })
    await validateNativeArtifacts(baselineReport, artifacts)
    await captureNativePhase(exampleRoot, artifacts, baselineReport)
    if (platform === 'android') { await assertAndroidMarker(device, 'rn-hmr-baseline') }
    const beforeScreenshot = await captureVerified('runtime-before.png', device, baseline)

    const updated = originalMarker.replace('rn-hmr-baseline', 'rn-hmr-updated').replace('bg-emerald-500', 'bg-rose-500')
    markerChanged = true
    semanticReporter.setRevision('rn-hmr-updated-10b981')
    await fs.writeFile(markerFile, updated, 'utf8')
    const hmr = await waitForReportOrExit('rn-hmr-updated', run, activeMetro, { cssHmrColor: '#10b981', reportTimeout: 120_000 })
    const hmrReport = withNativeEnvironment(hmr.report, nativeEnvironment)
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(hmrReport, null, 2)}\n`, 'utf8')
    semanticReporter.assertReceipts(hmrReport)
    validateReactNativeReport(hmrReport, platform, { runId, revision: 'rn-hmr-updated-10b981' })
    await validateNativeArtifacts(hmrReport, artifacts)
    await captureNativePhase(exampleRoot, artifacts, hmrReport)
    if (platform === 'android') { await assertAndroidMarker(device, 'rn-hmr-updated') }
    const afterTsxScreenshot = await captureVerified('runtime-tsx-after.png', device, hmr)
    const updatedCss = originalCss.replace('#10b981', '#f59e0b')
    if (updatedCss === originalCss) { throw new Error('CSS HMR probe color was not found') }
    cssChanged = true
    semanticReporter.setRevision('rn-hmr-updated-f59e0b')
    await fs.writeFile(cssFile, updatedCss, 'utf8')
    const cssHmr = await waitForReportOrExit('rn-hmr-updated', run, activeMetro, { cssHmrColor: '#f59e0b', reportTimeout: 120_000 })
    const cssHmrReport = withNativeEnvironment(cssHmr.report, nativeEnvironment)
    await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(cssHmrReport, null, 2)}\n`, 'utf8')
    semanticReporter.assertReceipts(cssHmrReport)
    validateReactNativeReport(cssHmrReport, platform, { runId, revision: 'rn-hmr-updated-f59e0b' })
    await validateNativeArtifacts(cssHmrReport, artifacts)
    await captureNativePhase(exampleRoot, artifacts, cssHmrReport)
    await validateNativeHmrObservations(artifacts, platform)
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
  }, async () => {
    const errors: unknown[] = []
    const attempt = async (cleanup: () => unknown | Promise<unknown>) => {
      try { await cleanup() }
      catch (error) { errors.push(error) }
    }
    await attempt(() => stopAndroidDialogGuard?.())
    semanticReporter.stop()
    await attempt(() => semanticReporter.drain())
    if (!semanticReporter.capturePending()) {
      if (!completed && metro) { await attempt(() => captureFailureDiagnostics(device, androidEnvironment?.receipt.logcat.since)) }
    }
    await attempt(() => stopOwnedProcess(run))
    await attempt(() => run?.catch(() => undefined))
    if (metro && httpObservation) { await attempt(() => httpObservation.drain()) }
    await attempt(() => stopOwnedProcess(metro))
    await attempt(() => metro?.catch(() => undefined))
    await attempt(() => logFile?.close())
    await attempt(() => metroLogFile?.close())
    await attempt(() => reporter.close())
    if (errors.length) { throw new AggregateError(errors, 'React Native 运行收尾失败') }
  })
}

await runStageProducer('react-native', () => runWithCleanup(main, () => publishAfterCapture(artifactSession, semanticReporter, restoreAfterCapture)))
