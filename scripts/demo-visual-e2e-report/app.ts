import type { ChildProcess } from 'node:child_process'
import type { AppCase } from '../../e2e/hbuilderx-local/cases.ts'
import type { HBuilderXRunner } from '../../packages/hbuilderx-runner/src/types.ts'
import type { StyleIsolationVariant } from './style-isolation.ts'
import type { CaseResult, RuntimeContext, VisualHmrStepResult } from './types.ts'
import { spawnSync } from 'node:child_process'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import { inspect } from 'node:util'
import path from 'pathe'
import { PNG } from 'pngjs'
import {
  analyzeScreenshotColorPresence,
  captureAndroidScreenshot,
  isAndroidDebugShell,
  parseHexColorFromClass,
  readAndroidUiHierarchy,
  resolveAdbCommand,
} from '../../e2e/hbuilderx-local/android-runtime.ts'
import { removeLegacyAppMarkers, rewriteAppMarker } from '../../e2e/hbuilderx-local/app-marker.ts'
import { readExistingAppHmrTransformedOutput, readExistingAppTransformedOutput } from '../../e2e/hbuilderx-local/app-output.ts'
import { bindAppTarget, readAppLaunchOption } from '../../e2e/hbuilderx-local/app-target.ts'
import { resolveAppHmrSteps } from '../../e2e/hbuilderx-local/cases.ts'
import { createHarmonyDomProbe } from '../../e2e/hbuilderx-local/harmony-dom-probe.ts'
import { captureHarmonyRuntimeEvidence, waitForHarmonyRuntimeEvidence } from '../../e2e/hbuilderx-local/harmony-runtime.ts'
import { observeHmrStep } from '../../e2e/hbuilderx-local/hmr-lifecycle.ts'
import { captureIosScreenshot, waitForIosRuntimeEvidence } from '../../e2e/hbuilderx-local/ios-runtime.ts'
import { captureNativeLog } from '../../e2e/hbuilderx-local/native-log.ts'
import {
  assertAndroidToolchain,
  assertHarmonyToolchain,
  assertIosSimulatorToolchain,
  createLocalHBuilderXRunner,
  fileExists,
  hbuilderxAppTimeoutMs,
  pollIntervalMs,
  readUtf8,
  resolveHdcCommand,
  wait,
} from '../../e2e/hbuilderx-local/process.ts'
import { findForbiddenRuntimeLogs, findMissingRuntimeLogs, resolveAppRuntimeLogContract } from '../../e2e/hbuilderx-local/render-mode.ts'
import { appendHmrSourceMutation, createHmrSourceRestore } from '../../e2e/hbuilderx-local/source-mutations.ts'
import { createHBuilderXAppProject } from '../hbuilderx-app-project'
import { cleanupHBuilderXResources } from '../hbuilderx-project-resources'
import { countMarkerPixelChanges, locateMarkerColor } from './app-marker-visual.ts'
import { analyzeHarmonyDomTextPairs, captureAndAnalyzeHarmonyLayout } from './harmony-layout.ts'
import { finalizeHarmonyAppOutput } from './harmony-output.ts'
import { resolveHmrScreenshotPath, resolveHmrStepScreenshotPath, resolveScreenshotPath } from './screenshots.ts'
import {
  readManifest,
  resolveStyleIsolationVariants,

  writeManifest,
  writeStyleIsolationVariantManifest,
} from './style-isolation.ts'

const appReadyTimeoutMs = Number(process.env['DEMO_VISUAL_APP_READY_TIMEOUT_MS'] ?? 120_000)
const appOutputTimeoutMs = Number(process.env['DEMO_VISUAL_APP_OUTPUT_TIMEOUT_MS'] ?? Math.min(hbuilderxAppTimeoutMs, 180_000))
const harmonyScreenshotTimeoutMs = Number(process.env['DEMO_VISUAL_HARMONY_SCREENSHOT_TIMEOUT_MS'] ?? 30_000)
const iosScreenshotTimeoutMs = Number(process.env['DEMO_VISUAL_IOS_SCREENSHOT_TIMEOUT_MS'] ?? 30_000)

function resolveAppDemoName(item: AppCase) {
  return path.basename(path.resolve(item.projectDir))
}

function resolveAppMarkerAnchors(item: AppCase) {
  return item.markerAnchorCandidates?.length ? item.markerAnchorCandidates : [item.markerAnchor]
}

function resolveLaunchArg(item: AppCase, name: string) {
  const index = item.launchArgs?.indexOf(name) ?? -1
  return index >= 0 ? item.launchArgs?.[index + 1] : undefined
}

function resolveAppOutputDirCandidates(item: AppCase) {
  return item.outputDirCandidates?.length ? item.outputDirCandidates : [item.outputDir]
}

function resolveAppIntermediateOutputTargets(item: AppCase, projectRoot: string) {
  const targets = new Set<string>()
  if (item.platform === 'app-android' || item.platform === 'app-ios' || item.platform === 'app-harmony') {
    targets.add(path.resolve(projectRoot, '.debug'))
    targets.add(path.resolve(projectRoot, `unpackage/dist/dev/.tsc/${item.platform}`))
    targets.add(path.resolve(projectRoot, `unpackage/dist/dev/.uvue/${item.platform}`))
    targets.add(path.resolve(projectRoot, `unpackage/cache/.${item.platform}`))
  }
  return [...targets]
}

function resolveAppStyleOutputFiles(outputRoot: string, item: AppCase) {
  return (item.styleOutputFiles ?? []).map(file => path.resolve(outputRoot, file))
}

async function findMissingAppFiles(item: AppCase, outputRoot: string) {
  const missing: string[] = []
  for (const file of item.requiredFiles) {
    if (!(await fileExists(path.resolve(outputRoot, file)))) {
      missing.push(file)
    }
  }
  return missing
}

async function readExistingAppStyleOutput(outputRoot: string, item: AppCase) {
  const styleFiles = resolveAppStyleOutputFiles(outputRoot, item)
  if (styleFiles.length === 0) {
    return ''
  }
  if (!(await Promise.all(styleFiles.map(fileExists))).every(Boolean)) {
    return undefined
  }
  return (await Promise.all(styleFiles.map(readUtf8))).join('\n')
}

function hasContent(source: string, entries: Array<string | RegExp>) {
  return entries.every((entry) => {
    if (typeof entry === 'string') {
      return source.includes(entry)
    }
    return entry.test(source)
  })
}

function hasNoContent(source: string, entries: Array<string | RegExp> | undefined) {
  return (entries ?? []).every((entry) => {
    if (typeof entry === 'string') {
      return !source.includes(entry)
    }
    return !entry.test(source)
  })
}

async function waitForAppRuntimeLogContract(item: AppCase, logs: string[], ensureRunning: () => void) {
  const contract = resolveAppRuntimeLogContract(item)
  if (contract.contains.length === 0) {
    return contract
  }
  const startedAt = Date.now()
  while (Date.now() - startedAt < appReadyTimeoutMs) {
    ensureRunning()
    if (findMissingRuntimeLogs(logs.join(''), contract.contains).length === 0) {
      return contract
    }
    await wait(pollIntervalMs)
  }
  throw new Error(`${item.name} 未进入目标 App 渲染模式：expected=${contract.contains.map(String).join(' | ')}`)
}

async function findReadyAppOutputRoot(item: AppCase, projectRoot: string, expected: Array<string | RegExp>, styleExpected?: Array<string | RegExp>) {
  for (const outputDir of resolveAppOutputDirCandidates(item)) {
    const outputRoot = path.resolve(projectRoot, outputDir)
    const missing = await findMissingAppFiles(item, outputRoot)
    if (missing.length > 0) {
      continue
    }
    if (item.platform === 'app-harmony') {
      await finalizeHarmonyAppOutput(projectRoot, outputRoot)
    }
    const transformed = await readExistingAppTransformedOutput(projectRoot, outputRoot, item)
    const style = styleExpected?.length ? await readExistingAppStyleOutput(outputRoot, item) : ''
    if (
      transformed
      && hasContent(transformed, expected)
      && (styleExpected?.length ? style != null && hasContent(style, styleExpected) : true)
    ) {
      return outputRoot
    }
  }
  return undefined
}

async function waitForAppOutputRoot(
  item: AppCase,
  projectRoot: string,
  expected: Array<string | RegExp>,
  timeoutMs: number,
  ensureRunning: () => void,
  styleExpected?: Array<string | RegExp>,
  forbidden?: Array<string | RegExp>,
) {
  const startedAt = Date.now()
  let latest = ''
  let latestStyle = ''
  let missingFiles: string[] = []
  while (Date.now() - startedAt < timeoutMs) {
    ensureRunning()
    for (const outputDir of resolveAppOutputDirCandidates(item)) {
      const outputRoot = path.resolve(projectRoot, outputDir)
      const missing = await findMissingAppFiles(item, outputRoot)
      if (missing.length > 0) {
        missingFiles = missing
        continue
      }
      if (item.platform === 'app-harmony') {
        await finalizeHarmonyAppOutput(projectRoot, outputRoot)
      }
      const transformed = await readExistingAppTransformedOutput(projectRoot, outputRoot, item)
      if (!transformed) {
        continue
      }
      latest = transformed
      if (!hasContent(transformed, expected)) {
        continue
      }
      const forbiddenScope = forbidden?.length
        ? await readExistingAppHmrTransformedOutput(projectRoot, outputRoot, item)
        : transformed
      if (forbiddenScope == null || !hasNoContent(forbiddenScope, forbidden)) {
        continue
      }
      if (styleExpected?.length) {
        const style = await readExistingAppStyleOutput(outputRoot, item)
        if (style == null) {
          continue
        }
        latestStyle = style
        if (!hasContent(style, styleExpected)) {
          continue
        }
      }
      return outputRoot
    }
    await wait(pollIntervalMs)
  }
  throw new Error(`${item.name} App 产物未包含预期内容\nmissingFiles=${missingFiles.join(' | ')}\nmissingTransformed=${expected.filter(value => !hasContent(latest, [value])).map(String).join(' | ')}\nmissingStyles=${styleExpected?.filter(value => !hasContent(latestStyle, [value])).map(String).join(' | ') ?? ''}\nexpected=${expected.map(String).join(' | ')}\nforbidden=${forbidden?.map(String).join(' | ') ?? ''}\nstyleExpected=${styleExpected?.map(String).join(' | ') ?? ''}\nlatest=${latest.slice(0, 2000)}\nlatestStyle=${latestStyle.slice(0, 2000)}`)
}

async function cleanAppOutput(item: AppCase, projectRoot: string) {
  const targets = [
    ...resolveAppOutputDirCandidates(item).map(outputDir => path.resolve(projectRoot, outputDir)),
    ...resolveAppIntermediateOutputTargets(item, projectRoot),
    ...(item.transformedFiles ?? []).map(file => path.resolve(projectRoot, file)),
  ]
  await Promise.all([...new Set(targets)].map(async (target) => {
    await rmWithRetry(target)
  }))
}

async function rmWithRetry(target: string) {
  const attempts = 5
  for (let index = 0; index < attempts; index++) {
    try {
      await fs.rm(target, { recursive: true, force: true })
      return
    }
    catch (error) {
      if (index === attempts - 1) {
        throw error
      }
      await wait(500)
    }
  }
}

async function writeAppMarker(
  file: string,
  anchors: string[],
  marker: {
    className: string
    textClassName?: string
    text: string
  },
) {
  await fs.writeFile(file, rewriteAppMarker(await readUtf8(file), anchors, marker), 'utf8')
}

function cleanupAndroidAppRuntime(env: Record<string, string | undefined>, deviceId?: string) {
  const adb = resolveAdbCommand(env)
  spawnSync(adb, [...createAndroidAdbArgs(deviceId), 'reverse', '--remove-all'], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function createAndroidAdbArgs(deviceId?: string) {
  return [
    ...(deviceId ? ['-s', deviceId] : []),
  ]
}

function resolveAndroidScreenshotDeviceId(item: AppCase) {
  return readAppLaunchOption(item.launchArgs ?? [], '--deviceId')!
}

function resolveHarmonyScreenshotDeviceId(item: AppCase) {
  return readAppLaunchOption(item.launchArgs ?? [], '--deviceId')!
}

function createHdcArgs(deviceId?: string) {
  return [
    ...(deviceId ? ['-t', deviceId] : []),
  ]
}

async function captureHarmonyScreenshot(screenshot: string, item: AppCase) {
  await fs.mkdir(path.dirname(screenshot), { recursive: true })
  const hdc = resolveHdcCommand()
  const deviceId = resolveHarmonyScreenshotDeviceId(item)
  const baseArgs = createHdcArgs(deviceId)
  const remote = `/data/local/tmp/demo-visual-${process.pid}-${Date.now()}.jpeg`
  const localJpeg = `${screenshot}.jpeg`
  const snapshot = spawnSync(hdc, [...baseArgs, 'shell', 'snapshot_display', '-f', remote], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: harmonyScreenshotTimeoutMs,
  })
  if (snapshot.status !== 0) {
    const timeoutMessage = snapshot.error?.message ? ` error=${snapshot.error.message}` : ''
    throw new Error(`Harmony 截图失败：${snapshot.stderr || snapshot.stdout || `exit=${snapshot.status} signal=${snapshot.signal ?? 'none'}${timeoutMessage}`}`)
  }
  const recv = spawnSync(hdc, [...baseArgs, 'file', 'recv', remote, localJpeg], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: harmonyScreenshotTimeoutMs,
  })
  spawnSync(hdc, [...baseArgs, 'shell', 'rm', '-f', remote], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: harmonyScreenshotTimeoutMs,
  })
  if (recv.status !== 0) {
    const timeoutMessage = recv.error?.message ? ` error=${recv.error.message}` : ''
    throw new Error(`Harmony 截图拉取失败：${recv.stderr || recv.stdout || `exit=${recv.status} signal=${recv.signal ?? 'none'}${timeoutMessage}`}`)
  }
  const convert = spawnSync('sips', ['-s', 'format', 'png', localJpeg, '--out', screenshot], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: harmonyScreenshotTimeoutMs,
  })
  if (convert.status !== 0) {
    const timeoutMessage = convert.error?.message ? ` error=${convert.error.message}` : ''
    throw new Error(`Harmony 截图格式转换失败：${convert.stderr || convert.stdout || `exit=${convert.status} signal=${convert.signal ?? 'none'}${timeoutMessage}`}`)
  }
  await fs.rm(localJpeg, { force: true })
}

async function captureAppScreenshot(item: AppCase, screenshot: string, env: Record<string, string | undefined>) {
  if (item.platform === 'app-android') {
    await captureAndroidScreenshot(screenshot, env, resolveAndroidScreenshotDeviceId(item))
    return
  }
  if (item.platform === 'app-harmony') {
    await captureHarmonyScreenshot(screenshot, item)
    return
  }
  await captureIosScreenshot(screenshot, readAppLaunchOption(item.launchArgs ?? [], '--deviceId'), iosScreenshotTimeoutMs)
}

async function analyzeAppScreenshot(screenshot: string) {
  const image = PNG.sync.read(fsSync.readFileSync(screenshot))
  const data = image.data
  let visiblePixels = 0
  let nonWhitePixels = 0
  const totalPixels = image.width * image.height
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 255
    if (alpha < 8) {
      continue
    }
    visiblePixels += 1
    const red = data[index] ?? 255
    const green = data[index + 1] ?? 255
    const blue = data[index + 2] ?? 255
    if (red < 248 || green < 248 || blue < 248) {
      nonWhitePixels += 1
    }
  }
  return {
    height: image.height,
    nonWhitePixels,
    nonWhiteRatio: totalPixels === 0 ? 0 : nonWhitePixels / totalPixels,
    totalPixels,
    visiblePixels,
    width: image.width,
  }
}

export function resolveExpectedMarkerTextColor(markerTextClass?: string) {
  if (!markerTextClass) {
    return undefined
  }
  const arbitraryColor = [...markerTextClass.matchAll(/\btext-\[#([\da-f]{6})\]/gi)].at(-1)?.[1]
  const color = arbitraryColor ?? (markerTextClass.split(/\s+/).includes('text-white') ? 'ffffff' : undefined)
  if (!color) {
    return undefined
  }
  return {
    blue: Number.parseInt(color.slice(4, 6), 16),
    green: Number.parseInt(color.slice(2, 4), 16),
    red: Number.parseInt(color.slice(0, 2), 16),
  }
}

async function analyzeIssue1002MarkerPresentation(
  screenshot: string,
  marker: Awaited<ReturnType<typeof analyzeScreenshotColorPresence>>,
  markerClass: string,
  markerTextClass?: string,
) {
  const image = PNG.sync.read(fsSync.readFileSync(screenshot))
  const bounds = marker.bounds
  if (!bounds) {
    return { ready: false }
  }

  const width = bounds.maxX - bounds.minX + 1
  const height = bounds.maxY - bounds.minY + 1
  const insetX = Math.max(1, Math.floor(width * 0.2))
  const insetY = Math.max(1, Math.floor(height * 0.2))
  const expectedTextColor = resolveExpectedMarkerTextColor(markerTextClass)
  let centerTextColorPixels = 0
  for (let y = bounds.minY + insetY; y <= bounds.maxY - insetY; y++) {
    for (let x = bounds.minX + insetX; x <= bounds.maxX - insetX; x++) {
      const index = (y * image.width + x) * 4
      const red = image.data[index] ?? 0
      const green = image.data[index + 1] ?? 0
      const blue = image.data[index + 2] ?? 0
      if (
        expectedTextColor
        && Math.abs(red - expectedTextColor.red) <= 4
        && Math.abs(green - expectedTextColor.green) <= 4
        && Math.abs(blue - expectedTextColor.blue) <= 4
      ) {
        centerTextColorPixels += 1
      }
    }
  }

  const cornerInset = Math.max(1, Math.floor(Math.min(width, height) * 0.12))
  const cornerPoints = [
    [bounds.minX + cornerInset, bounds.minY + cornerInset],
    [bounds.maxX - cornerInset, bounds.minY + cornerInset],
    [bounds.minX + cornerInset, bounds.maxY - cornerInset],
    [bounds.maxX - cornerInset, bounds.maxY - cornerInset],
  ]
  const background = marker.color
  const coloredCorners = cornerPoints.filter(([x, y]) => {
    const index = (y * image.width + x) * 4
    return Math.abs((image.data[index] ?? 0) - background.red) <= 3
      && Math.abs((image.data[index + 1] ?? 0) - background.green) <= 3
      && Math.abs((image.data[index + 2] ?? 0) - background.blue) <= 3
  }).length
  const roundedReady = !markerClass.includes('rounded-full') || coloredCorners <= 1
  const textColorReady = !expectedTextColor || centerTextColorPixels >= 8

  return {
    centerTextColorPixels,
    coloredCorners,
    expectedTextColor,
    ready: roundedReady && textColorReady,
    roundedReady,
    textColorReady,
  }
}

async function collectAppScreenshotEvidence(
  item: AppCase,
  screenshot: string,
  env: Record<string, string | undefined>,
  expectedMarkerClass?: string,
  expectedMarkerTextClass?: string,
  expectedBackgroundColor?: string,
) {
  const visual = await analyzeAppScreenshot(screenshot)
  const expectedMarkerColor = parseHexColorFromClass(expectedBackgroundColor ? `bg-[${expectedBackgroundColor}]` : expectedMarkerClass ?? '')
  const marker = expectedMarkerColor
    ? locateMarkerColor(PNG.sync.read(await fs.readFile(screenshot)), expectedMarkerColor, expectedMarkerClass ?? '')
    : undefined
  const markerPresentation = marker && expectedMarkerClass
    ? await analyzeIssue1002MarkerPresentation(
        screenshot,
        marker,
        expectedMarkerClass,
        expectedMarkerTextClass,
      )
    : undefined
  const markerReady = marker ? marker.matched && (markerPresentation?.ready ?? true) : true
  if (item.platform === 'app-android') {
    const deviceId = resolveAndroidScreenshotDeviceId(item)
    const uiHierarchy = await readAndroidUiHierarchy(env, deviceId)
    return {
      marker,
      markerPresentation,
      ready: !isAndroidDebugShell(uiHierarchy) && visual.nonWhiteRatio > 0.01 && markerReady,
      uiTextPreview: uiHierarchy
        .replace(/\s+/g, ' ')
        .slice(0, 800),
      visual,
    }
  }
  if (item.platform === 'app-harmony') {
    return {
      marker,
      markerPresentation,
      ready: visual.nonWhiteRatio > 0.025 && markerReady,
      visual,
    }
  }
  return {
    marker,
    markerPresentation,
    ready: visual.nonWhiteRatio > 0.025 && markerReady,
    visual,
  }
}

async function waitForAppScreenshotReady(
  item: AppCase,
  screenshot: string,
  env: Record<string, string | undefined>,
  label: string,
  ensureRunning: () => void,
  expectedMarkerClass?: string,
  expectedMarkerTextClass?: string,
  expectedBackgroundColor?: string,
  previous?: { screenshot: string, markerClass: string },
  timeoutMs = appReadyTimeoutMs,
) {
  const startedAt = Date.now()
  let latest: Record<string, unknown> | undefined
  while (Date.now() - startedAt < timeoutMs) {
    ensureRunning()
    const iosRuntime = item.platform === 'app-ios'
      ? await waitForIosRuntimeEvidence({
          deviceId: readAppLaunchOption(item.launchArgs ?? [], '--deviceId'),
          ensureRunning,
          markerClass: expectedMarkerClass ?? '',
          screenshot,
          screenshotTimeoutMs: iosScreenshotTimeoutMs,
          timeoutMs: Math.max(1, timeoutMs - (Date.now() - startedAt)),
          ...(previous ? { previous } : {}),
        })
      : undefined
    if (!iosRuntime) {
      await captureAppScreenshot(item, screenshot, env)
    }
    ensureRunning()
    const evidence = await collectAppScreenshotEvidence(item, screenshot, env, expectedMarkerClass, expectedMarkerTextClass, expectedBackgroundColor)
    latest = evidence
    if (evidence.ready) {
      return { ...evidence, ...iosRuntime }
    }
    await wait(2000)
  }
  throw new Error(`${label} App 截图未进入真实页面\n${JSON.stringify(latest, null, 2)}`)
}

function createProcessExitTracker(child: ChildProcess) {
  let exit: { code: number | null, signal: NodeJS.Signals | null } | undefined
  const startedAt = Date.now()
  const closed = new Promise<void>((resolve) => {
    child.on('close', (code, signal) => {
      exit = { code, signal }
      resolve()
    })
  })
  return {
    closed,
    ensureRunning(logs: string[]) {
      if (exit && exit.code !== 0) {
        throw new Error(`命令失败：HBuilderX app dev exit=${exit.signal ?? exit.code}\n${logs.join('')}`)
      }
      if (!exit && Date.now() - startedAt > hbuilderxAppTimeoutMs) {
        throw new Error(`命令超时：HBuilderX app dev timeout=${hbuilderxAppTimeoutMs}ms\n${logs.join('')}`)
      }
    },
  }
}

function startAppLaunch(
  item: AppCase,
  projectRoot: string,
  projectPath: string,
  hbuilderx: HBuilderXRunner,
  toolEnv: Record<string, string | undefined>,
) {
  const launchArgs = [...(item.launchArgs ?? [])]
  if (item.platform !== 'app-harmony' && !launchArgs.includes('--pagePath')) {
    launchArgs.push('--pagePath', 'pages/index/index')
  }
  const command = hbuilderx.spawn({
    args: ['launch', item.platform, '--project', projectPath, ...launchArgs],
    cwd: projectRoot,
    env: {
      WEAPP_TW_HMR_TIMING: '1',
      ...toolEnv,
      ...item.launchEnv,
    },
  })
  const tracker = createProcessExitTracker(command.child)
  return { ...command, tracker }
}

async function stopAppLaunch(launch: ReturnType<typeof startAppLaunch> | undefined) {
  if (!launch) {
    return
  }
  await launch.stop('SIGINT')
}

async function runAppCaseVariant(
  item: AppCase,
  context: RuntimeContext,
  results: CaseResult[],
  variant: StyleIsolationVariant,
  shared?: {
    hbuilderx?: HBuilderXRunner
    originalManifest?: string
    originalSource?: string
    toolEnv?: Record<string, string | undefined>
  },
) {
  const name = resolveAppDemoName(item)
  const platform = item.platform
  const screenshot = resolveScreenshotPath(context, name, platform, variant.key)
  const hmrBeforeScreenshot = resolveHmrScreenshotPath(context, name, platform, 'before', variant.key)
  const hmrAfterScreenshot = resolveHmrScreenshotPath(context, name, platform, 'after', variant.key)
  let projectRoot = path.resolve(context.repoRoot, item.projectDir)
  const sourceFile = path.resolve(projectRoot, item.sourceFile)
  const domProbe = item.platform === 'app-harmony' && item.renderMode === 'vapor' ? createHarmonyDomProbe() : undefined
  let domObserver: ReturnType<NonNullable<typeof domProbe>['observe']> | undefined
  let nativeLog: ReturnType<typeof captureNativeLog> | undefined
  const domOptions = domProbe ? { readDomProbe: () => domObserver?.read() } : {}
  let restoreMutations: (() => Promise<void>) | undefined
  let activeSourceFile = sourceFile
  let launch: ReturnType<typeof startAppLaunch> | undefined
  let harmonyFailureEvidence: Parameters<typeof captureHarmonyRuntimeEvidence>[0] | undefined
  let hmrLifecycle: ReturnType<typeof observeHmrStep> | undefined
  let projectSession: Awaited<ReturnType<typeof createHBuilderXAppProject>> | undefined
  let hbuilderx = shared?.hbuilderx
  let caseResult: CaseResult | undefined
  let failure: { error: unknown } | undefined
  let beforeScreenshotEvidence: Record<string, unknown> | undefined
  let afterScreenshotEvidence: Record<string, unknown> | undefined
  let harmonyLayoutEvidence: Awaited<ReturnType<typeof captureAndAnalyzeHarmonyLayout>> | undefined

  try {
    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: prepare\n`)
    let toolEnv = shared?.toolEnv ?? {}
    if (item.platform === 'app-android') {
      toolEnv = shared?.toolEnv ?? assertAndroidToolchain()
      cleanupAndroidAppRuntime(toolEnv, resolveAndroidScreenshotDeviceId(item))
      await wait(1500)
    }
    else if (item.platform === 'app-ios') {
      assertIosSimulatorToolchain()
    }
    else {
      assertHarmonyToolchain(process.env, resolveLaunchArg(item, '--deviceId'))
    }

    hbuilderx ??= await createLocalHBuilderXRunner(projectRoot, toolEnv)
    projectSession = await createHBuilderXAppProject({ projectRoot, platform, runner: hbuilderx, timeoutMs: hbuilderxAppTimeoutMs, env: toolEnv })
    projectRoot = projectSession.projectRoot
    activeSourceFile = path.resolve(projectSession.projectPath, item.sourceFile)
    const originalSource = shared?.originalSource ?? removeLegacyAppMarkers(await readUtf8(sourceFile))
    const originalManifest = shared?.originalManifest ?? await readManifest(projectRoot).catch(() => undefined)
    const restoreVariantManifest = async () => {
      if (originalManifest === undefined) {
        return
      }
      await writeManifest(projectRoot, originalManifest)
      if (variant.key) {
        await writeStyleIsolationVariantManifest(projectRoot, variant)
      }
    }
    await fs.writeFile(activeSourceFile, originalSource, 'utf8')
    await restoreVariantManifest()
    restoreMutations = await createHmrSourceRestore(resolveAppHmrSteps(item).flatMap(step => step.sourceMutation ? [path.resolve(projectRoot, step.sourceMutation.file)] : []))

    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: write initial marker\n`)
    await writeAppMarker(activeSourceFile, resolveAppMarkerAnchors(item), {
      className: item.markerClass,
      textClassName: item.markerTextClass,
      text: item.markerText,
    })
    if (domProbe) {
      await fs.writeFile(activeSourceFile, domProbe.inject(await readUtf8(activeSourceFile)), 'utf8')
    }
    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: clean output\n`)
    await cleanAppOutput(item, projectRoot)

    await projectSession.open()

    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: launch ${item.platform}\n`)
    launch = startAppLaunch(item, projectRoot, projectSession.launchProject, hbuilderx, toolEnv)
    await fs.mkdir(path.dirname(hmrBeforeScreenshot), { recursive: true })
    nativeLog = captureNativeLog(launch.child, path.join(path.dirname(hmrBeforeScreenshot), 'hbuilderx.log'))
    domObserver = domProbe?.observe(launch.child)
    const ensureInitialRunning = () => launch?.tracker.ensureRunning(launch.logs)

    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: wait initial output\n`)
    const initialExpected = [...item.transformedContains, ...(item.compiledStyleContains ?? [])]
    const initialOutputRoot = await waitForAppOutputRoot(item, projectRoot, initialExpected, appOutputTimeoutMs, ensureInitialRunning, item.styleContains)
    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: initial output ${initialOutputRoot}\n`)
    const runtimeLogContract = await waitForAppRuntimeLogContract(item, launch.logs, ensureInitialRunning)
    await wait(Number(process.env['DEMO_VISUAL_APP_SCREENSHOT_DELAY_MS'] ?? 3000))
    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: screenshot before\n`)
    beforeScreenshotEvidence = await waitForAppScreenshotReady(item, hmrBeforeScreenshot, toolEnv, `${item.name} HMR 前`, ensureInitialRunning, item.markerClass, item.markerTextClass, item.runtime?.backgroundColor)
    const initialHarmony = item.platform === 'app-harmony'
      ? await waitForHarmonyRuntimeEvidence({
          ...domOptions,
          deviceId: resolveHarmonyScreenshotDeviceId(item),
          directory: path.join(path.dirname(hmrBeforeScreenshot), 'runtime-initial'),
          marker: item.markerText,
          timeoutMs: appOutputTimeoutMs,
          ensureRunning: ensureInitialRunning,
        })
      : undefined
    if (item.platform === 'app-harmony' && item.harmonyRuntimeTextPairs?.length) {
      const layoutFile = path.join(path.dirname(hmrBeforeScreenshot), 'layout.json')
      if (initialHarmony?.dom) {
        const domFile = path.join(path.dirname(hmrBeforeScreenshot), 'dom-layout.json')
        await fs.writeFile(domFile, `${JSON.stringify(initialHarmony.dom, null, 2)}\n`)
        harmonyLayoutEvidence = { file: domFile, pairs: analyzeHarmonyDomTextPairs(initialHarmony.dom, item.harmonyRuntimeTextPairs) }
      }
      else {
        harmonyLayoutEvidence = await captureAndAnalyzeHarmonyLayout({
          deviceId: resolveHarmonyScreenshotDeviceId(item),
          file: layoutFile,
          pairs: item.harmonyRuntimeTextPairs,
          timeoutMs: harmonyScreenshotTimeoutMs,
        })
      }
    }
    const ensureHmrRunning = () => {
      ensureInitialRunning()
      hmrLifecycle?.assertNoFallback()
    }
    const hmrSteps: VisualHmrStepResult[] = []
    let previousAfterScreenshot = hmrBeforeScreenshot
    let previousMarkerClass = item.markerClass
    let previousMarkerColor = parseHexColorFromClass(item.runtime?.backgroundColor ? `bg-[${item.runtime.backgroundColor}]` : item.markerClass)
    let hmrOutputRoot = initialOutputRoot
    for (const step of resolveAppHmrSteps(item)) {
      const stepBeforeScreenshot = resolveHmrStepScreenshotPath(context, name, platform, step.name, 'before', variant.key)
      const stepAfterScreenshot = resolveHmrStepScreenshotPath(context, name, platform, step.name, 'after', variant.key)
      await fs.mkdir(path.dirname(stepBeforeScreenshot), { recursive: true })
      await fs.copyFile(previousAfterScreenshot, stepBeforeScreenshot)
      hmrLifecycle?.assertNoFallback()
      hmrLifecycle?.dispose()
      hmrLifecycle = observeHmrStep(launch.child, item.platform, item.updateMode)
      harmonyFailureEvidence = initialHarmony ? { ...domOptions, deviceId: resolveHarmonyScreenshotDeviceId(item), directory: path.join(path.dirname(stepAfterScreenshot), `runtime-${step.name}`), marker: step.markerText } : undefined
      process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: write hmr marker ${step.name}\n`)
      if (step.sourceMutation) {
        await appendHmrSourceMutation(projectRoot, step.sourceMutation)
      }
      await writeAppMarker(activeSourceFile, resolveAppMarkerAnchors(item), {
        className: step.markerClass,
        text: step.markerText,
        ...(step.markerTextClass ? { textClassName: step.markerTextClass } : {}),
      })
      await wait(Number(process.env['DEMO_VISUAL_APP_HMR_MUTATION_DELAY_MS'] ?? 1000))
      process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: wait hmr output ${step.name}\n`)
      const hmrExpected = [...step.transformedContains, ...(item.compiledStyleContains ?? [])]
      hmrOutputRoot = await waitForAppOutputRoot(
        item,
        projectRoot,
        hmrExpected,
        appOutputTimeoutMs,
        ensureHmrRunning,
        step.styleContains,
        [...(item.transformedNotContains ?? []), ...(step.transformedNotContains ?? [])],
      )
      process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: hmr output ${step.name} ${hmrOutputRoot}\n`)
      await wait(Number(process.env['DEMO_VISUAL_APP_SCREENSHOT_DELAY_MS'] ?? 3000))
      process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: screenshot after ${step.name}\n`)
      const captureEvidence = (timeoutMs = appReadyTimeoutMs) => waitForAppScreenshotReady(item, stepAfterScreenshot, toolEnv, `${item.name} HMR ${step.name} 后`, ensureHmrRunning, step.markerClass, step.markerTextClass, step.runtime?.backgroundColor, { screenshot: stepBeforeScreenshot, markerClass: previousMarkerClass }, timeoutMs)
      const evidence = item.platform === 'app-ios'
        ? await hmrLifecycle.waitForCompletion(appOutputTimeoutMs, ensureHmrRunning, captureEvidence)
        : await captureEvidence()
      if (!evidence) {
        throw new Error(`${item.name} HMR ${step.name} 缺少设备截图证据`)
      }
      if (item.platform !== 'app-ios') {
        await hmrLifecycle.waitForCompletion(appOutputTimeoutMs, ensureHmrRunning)
      }
      const harmonyRuntime = initialHarmony
        ? await waitForHarmonyRuntimeEvidence({
            ...domOptions,
            deviceId: resolveHarmonyScreenshotDeviceId(item),
            directory: path.join(path.dirname(stepAfterScreenshot), `runtime-${step.name}`),
            marker: step.markerText,
            previousPid: initialHarmony.pid,
            timeoutMs: appOutputTimeoutMs,
            ensureRunning: ensureHmrRunning,
          })
        : undefined
      const expectedMarkerColor = parseHexColorFromClass(step.runtime?.backgroundColor ? `bg-[${step.runtime.backgroundColor}]` : step.markerClass)
      const beforeMarker = expectedMarkerColor
        ? await analyzeScreenshotColorPresence(stepBeforeScreenshot, expectedMarkerColor)
        : undefined
      const markerColorDelta = beforeMarker && evidence.marker
        ? evidence.marker.matchingPixels - beforeMarker.matchingPixels
        : undefined
      const sameColor = expectedMarkerColor && previousMarkerColor
        && expectedMarkerColor.red === previousMarkerColor.red
        && expectedMarkerColor.green === previousMarkerColor.green
        && expectedMarkerColor.blue === previousMarkerColor.blue
      let markerPixelChanges: number | undefined
      if (sameColor) {
        const beforeImage = PNG.sync.read(await fs.readFile(stepBeforeScreenshot))
        const afterImage = PNG.sync.read(await fs.readFile(stepAfterScreenshot))
        const previousMarker = locateMarkerColor(beforeImage, expectedMarkerColor, previousMarkerClass)
        if (!previousMarker.bounds || !evidence.marker?.bounds) {
          throw new Error(`${item.name} HMR ${step.name} 无法定位前后标记`)
        }
        markerPixelChanges = countMarkerPixelChanges(beforeImage, afterImage, expectedMarkerColor, previousMarker.bounds, evidence.marker.bounds)
        if (markerPixelChanges <= 100) {
          throw new Error(`${item.name} HMR ${step.name} 同色标记位置或形状未改变：pixels=${markerPixelChanges}`)
        }
      }
      else if (markerColorDelta != null && markerColorDelta <= 100) {
        throw new Error(`${item.name} HMR ${step.name} 目标背景色像素未明显增加：before=${beforeMarker?.matchingPixels} after=${evidence.marker?.matchingPixels}`)
      }
      hmrLifecycle?.assertNoFallback()
      hmrSteps.push({
        afterScreenshot: stepAfterScreenshot,
        beforeScreenshot: stepBeforeScreenshot,
        classLiteral: [step.markerClass, step.markerTextClass].filter(Boolean).join(' '),
        evidence: {
          ...evidence,
          updateLifecycle: hmrLifecycle.snapshot(),
          markerColorDelta,
          markerPixelChanges,
          harmonyRuntime,
        },
        expectedBackgroundColor: step.runtime?.backgroundColor ?? step.markerClass.match(/bg-\[(#[0-9a-f]{6})\]/i)?.[1] ?? '',
        marker: step.markerText,
        name: step.name,
      })
      afterScreenshotEvidence = evidence
      previousAfterScreenshot = stepAfterScreenshot
      previousMarkerClass = step.markerClass
      previousMarkerColor = expectedMarkerColor
    }
    hmrLifecycle?.assertNoFallback()
    await fs.copyFile(previousAfterScreenshot, hmrAfterScreenshot)
    await fs.copyFile(hmrAfterScreenshot, screenshot)
    const forbiddenRuntimeLogs = findForbiddenRuntimeLogs(launch.logs.join(''), runtimeLogContract.notContains)
    if (forbiddenRuntimeLogs.length > 0) {
      throw new Error(`${item.name} 出现互斥 App 渲染模式日志：${forbiddenRuntimeLogs.map(String).join(' | ')}`)
    }

    caseResult = {
      name,
      platform,
      styleIsolationVariant: variant.key,
      status: 'passed',
      updateMode: item.updateMode ?? 'hmr',
      screenshot,
      hmrBeforeScreenshot,
      hmrAfterScreenshot,
      hmrSteps,
      diagnostics: {
        hmr: {
          mode: item.updateMode ?? 'hmr',
          markerText: hmrSteps.at(-1)?.marker,
          steps: hmrSteps,
        },
        initialOutputRoot,
        screenshot: {
          after: afterScreenshotEvidence,
          before: beforeScreenshotEvidence,
        },
        hmrOutputRoot,
        harmonyLayout: harmonyLayoutEvidence,
        launchArgs: item.launchArgs,
        renderMode: item.renderMode,
      },
    }

    await stopAppLaunch(launch)
    hmrLifecycle?.assertNoFallback()
    launch = undefined
  }
  catch (error) {
    if (harmonyFailureEvidence) {
      await captureHarmonyRuntimeEvidence(harmonyFailureEvidence).catch((captureError) => {
        process.stderr.write(`Harmony 失败现场取证也失败：${captureError}\n`)
      })
    }
    failure = { error }
  }
  finally {
    try {
      await cleanupHBuilderXResources([
        async () => { await stopAppLaunch(launch) },
        () => {
          if (!failure) {
            hmrLifecycle?.assertNoFallback()
          }
        },
        () => hmrLifecycle?.dispose(),
        () => domObserver?.dispose(),
        async () => { await nativeLog?.close() },
        async () => { await restoreMutations?.() },
        () => {
          if (item.platform === 'app-android') {
            cleanupAndroidAppRuntime(shared?.toolEnv ?? {}, resolveAndroidScreenshotDeviceId(item))
          }
        },
        async () => {
          if (shared?.originalSource !== undefined) {
            await fs.writeFile(sourceFile, shared.originalSource, 'utf8')
          }
        },
        async () => {
          if (shared?.originalManifest !== undefined) {
            await writeManifest(projectRoot, shared.originalManifest)
          }
        },
        async () => { await projectSession?.cleanup() },
      ])
    }
    catch (error) {
      failure = { error: failure
        ? new AggregateError([failure.error, error], 'HBuilderX App 验证与收尾均失败。', { cause: failure.error })
        : error }
    }
    const restoredOutput = await findReadyAppOutputRoot(item, projectRoot, item.transformedContains, item.styleContains).catch(() => undefined)
    if (restoredOutput) {
      process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: restored output ${restoredOutput}\n`)
    }
  }
  if (failure) {
    const launchLog = launch?.logs.join('').trim()
    results.push({
      ...caseResult,
      name,
      platform,
      styleIsolationVariant: variant.key,
      status: 'failed',
      updateMode: item.updateMode ?? 'hmr',
      error: [inspect(failure.error, { depth: null, colors: false }), launchLog ? `HBuilderX launch log:\n${launchLog}` : '']
        .filter(Boolean)
        .join('\n'),
      diagnostics: {
        ...caseResult?.diagnostics,
        launchArgs: item.launchArgs,
        projectRoot,
        updateLifecycle: hmrLifecycle?.snapshot(),
      },
    })
  }
  else if (caseResult) {
    results.push(caseResult)
    process.stdout.write(`[app-${platform}] ${name}${variant.key ? ` ${variant.key}` : ''}: passed\n`)
  }
}

export async function runAppCase(item: AppCase, context: RuntimeContext, results: CaseResult[]) {
  item = bindAppTarget(item)
  const projectRoot = path.resolve(context.repoRoot, item.projectDir)
  const sourceFile = path.resolve(projectRoot, item.sourceFile)
  const originalSource = removeLegacyAppMarkers(await readUtf8(sourceFile))
  const originalManifest = await readManifest(projectRoot).catch(() => undefined)
  const shared = {
    originalManifest,
    originalSource,
    toolEnv: item.platform === 'app-android' ? assertAndroidToolchain() : {},
  }
  const hbuilderx = await createLocalHBuilderXRunner(projectRoot, shared.toolEnv)
  try {
    for (const variant of resolveStyleIsolationVariants(item.projectDir)) {
      await runAppCaseVariant(item, context, results, variant, { ...shared, hbuilderx })
    }
  }
  finally {
    await fs.writeFile(sourceFile, originalSource, 'utf8').catch(() => undefined)
    if (originalManifest !== undefined) {
      await writeManifest(projectRoot, originalManifest).catch(() => undefined)
    }
  }
}
