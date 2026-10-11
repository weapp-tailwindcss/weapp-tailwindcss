import type { AndroidScreenBounds } from './android-runtime/marker-sample'
import { spawnSync } from 'node:child_process'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { PNG } from 'pngjs'
import { haveAndroidMarkerPixelsChanged, isSameAndroidMarker, readAndroidMarkerSample } from './android-runtime/marker-sample'
import { readAndroidUiDump } from './android-runtime/ui-hierarchy'

export interface AndroidRuntimeStyleExpectation {
  backgroundColor: string
  height: number
  markerText: string
  textColor?: string
  width: number
}

export interface AndroidRuntimeEvidence {
  background: Awaited<ReturnType<typeof analyzeScreenshotColorPresence>>
  density: number
  height: number
  markerBounds?: AndroidScreenBounds
  markerTextVisible: boolean
  screenshot: string
  screenshotChanged: boolean
  text?: Awaited<ReturnType<typeof analyzeScreenshotColorPresence>>
  uiTextPreview: string
  width: number
}

interface WaitForAndroidRuntimeEvidenceOptions {
  deviceId?: string
  ensureRunning: () => void
  env: Record<string, string | undefined>
  expectation: AndroidRuntimeStyleExpectation
  label: string
  previousScreenshot?: string
  screenshot: string
  timeoutMs: number
}

const defaultAndroidRuntimeComponent = 'io.dcloud.uniappx/io.dcloud.uniapp.UniAppActivity'

export function hasScreenshotContentChanged(current: Uint8Array, previous?: Uint8Array) {
  if (!previous || current.length !== previous.length) {
    return true
  }
  return current.some((value, index) => value !== previous[index])
}

const screenshotTimeoutMs = 30_000

function createAdbArgs(deviceId?: string) {
  return deviceId ? ['-s', deviceId] : []
}

export function resolveAdbCommand(env: Record<string, string | undefined>) {
  const pathEntries = (env.PATH ?? process.env.PATH ?? '').split(path.delimiter)
  const candidates = [
    'adb',
    ...pathEntries.map(item => path.resolve(item, process.platform === 'win32' ? 'adb.exe' : 'adb')),
  ]
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['version'], { encoding: 'utf8', env: { ...process.env, ...env } })
    if (result.status === 0) {
      return candidate
    }
  }
  return 'adb'
}

export function resolveAndroidDeviceId(launchArgs: string[] | undefined) {
  const index = launchArgs?.indexOf('--deviceId') ?? -1
  return process.env.E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID
    ?? process.env.E2E_HBUILDERX_ANDROID_DEVICE_ID
    ?? (index >= 0 ? launchArgs?.[index + 1] : undefined)
}

function readAndroidShellValue(
  env: Record<string, string | undefined>,
  deviceId: string | undefined,
  args: string[],
) {
  const result = spawnSync(resolveAdbCommand(env), [
    ...createAdbArgs(deviceId),
    'shell',
    ...args,
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: screenshotTimeoutMs,
  })
  return result.status === 0 ? result.stdout.trim() : ''
}

export function shouldRestoreAndroidRuntime(uiHierarchy: string, runtimeProcessId: string) {
  return isAndroidDebugShell(uiHierarchy) && /^\d+(?:\s+\d+)*$/.test(runtimeProcessId)
}

function restoreAndroidRuntimeForeground(
  uiHierarchy: string,
  env: Record<string, string | undefined>,
  deviceId?: string,
) {
  const component = env.E2E_HBUILDERX_ANDROID_RUNTIME_COMPONENT ?? defaultAndroidRuntimeComponent
  const packageName = component.split('/', 1)[0]
  if (!packageName) {
    return false
  }
  const runtimeProcessId = readAndroidShellValue(env, deviceId, ['pidof', packageName])
  if (!shouldRestoreAndroidRuntime(uiHierarchy, runtimeProcessId)) {
    return false
  }
  const result = spawnSync(resolveAdbCommand(env), [
    ...createAdbArgs(deviceId),
    'shell',
    'am',
    'start',
    '-n',
    component,
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: screenshotTimeoutMs,
  })
  return result.status === 0
}

export function collectAndroidRuntimeMetadata(
  env: Record<string, string | undefined>,
  deviceId?: string,
) {
  const model = readAndroidShellValue(env, deviceId, ['getprop', 'ro.product.model'])
  const api = readAndroidShellValue(env, deviceId, ['getprop', 'ro.build.version.sdk'])
  const webview = readAndroidShellValue(env, deviceId, ['dumpsys', 'package', 'com.google.android.webview'])
    || readAndroidShellValue(env, deviceId, ['dumpsys', 'package', 'com.android.webview'])
  return {
    api,
    deviceId: deviceId ?? 'default',
    model,
    webview: webview.match(/versionName=(\S+)/)?.[1] ?? 'unknown',
  }
}

export async function captureAndroidScreenshot(
  screenshot: string,
  env: Record<string, string | undefined>,
  deviceId?: string,
) {
  await fs.mkdir(path.dirname(screenshot), { recursive: true })
  const result = spawnSync(resolveAdbCommand(env), [
    ...createAdbArgs(deviceId),
    'exec-out',
    'screencap',
    '-p',
  ], {
    encoding: 'buffer',
    env: { ...process.env, ...env },
    killSignal: 'SIGTERM',
    maxBuffer: 20 * 1024 * 1024,
    timeout: screenshotTimeoutMs,
  })
  if (result.status !== 0 || result.stdout.length === 0) {
    const timeoutMessage = result.error?.message ? ` error=${result.error.message}` : ''
    throw new Error(`Android 截图失败：${result.stderr.toString() || `exit=${result.status} signal=${result.signal ?? 'none'}${timeoutMessage}`}`)
  }
  await fs.writeFile(screenshot, result.stdout)
}

export async function readAndroidUiHierarchy(env: Record<string, string | undefined>, deviceId?: string) {
  return await readAndroidUiDump(resolveAdbCommand(env), createAdbArgs(deviceId), env)
}

export function isAndroidDebugShell(uiHierarchy: string) {
  return /Connect to HBuilderX successfully|Failed to connect to \/127\.0\.0\.1|io\.dcloud\.uniappx:id\/pull_msg|io\.dcloud\.HBuilder\/io\.dcloud\.PandoraEntryActivity/.test(uiHierarchy)
}

function parseHexColor(value: string) {
  const match = value.match(/^#?([\da-f]{6})$/i)
  if (!match?.[1]) {
    throw new Error(`无法解析运行时颜色：${value}`)
  }
  return {
    blue: Number.parseInt(match[1].slice(4, 6), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    red: Number.parseInt(match[1].slice(0, 2), 16),
  }
}

export function parseHexColorFromClass(className: string) {
  const match = className.match(/\bbg-\[#([\da-f]{6})\]/i)
  return match?.[1] ? parseHexColor(match[1]) : undefined
}

export async function analyzeScreenshotColorPresence(
  screenshot: string,
  color: { red: number, green: number, blue: number },
  bounds?: { maxX: number, maxY: number, minX: number, minY: number },
) {
  const image = PNG.sync.read(fsSync.readFileSync(screenshot))
  const data = image.data
  let matchingPixels = 0
  let maxX = -1
  let maxY = -1
  let minX = image.width
  let minY = image.height
  for (let y = bounds?.minY ?? 0; y <= (bounds?.maxY ?? image.height - 1); y++) {
    for (let x = bounds?.minX ?? 0; x <= (bounds?.maxX ?? image.width - 1); x++) {
      const index = (y * image.width + x) * 4
      const alpha = data[index + 3] ?? 255
      if (alpha < 8) {
        continue
      }
      if (
        Math.abs((data[index] ?? 255) - color.red) <= 4
        && Math.abs((data[index + 1] ?? 255) - color.green) <= 4
        && Math.abs((data[index + 2] ?? 255) - color.blue) <= 4
      ) {
        matchingPixels += 1
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  return {
    bounds: matchingPixels > 0 ? { maxX, maxY, minX, minY } : undefined,
    color,
    matchingPixels,
    matched: matchingPixels > 100,
  }
}

function readAndroidDensity(env: Record<string, string | undefined>, deviceId?: string) {
  const result = spawnSync(resolveAdbCommand(env), [
    ...createAdbArgs(deviceId),
    'shell',
    'wm',
    'density',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: screenshotTimeoutMs,
  })
  const density = Number(result.stdout.match(/Override density:\s*(\d+)/)?.[1]
    ?? result.stdout.match(/Physical density:\s*(\d+)/)?.[1]
    ?? 160)
  return density / 160
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function scrollAndroidViewport(env: Record<string, string | undefined>, deviceId?: string) {
  spawnSync(resolveAdbCommand(env), [
    ...createAdbArgs(deviceId),
    'shell',
    'input',
    'swipe',
    '540',
    '1700',
    '540',
    '500',
    '400',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: screenshotTimeoutMs,
  })
}

export async function waitForAndroidRuntimeEvidence(options: WaitForAndroidRuntimeEvidenceOptions) {
  const startedAt = Date.now()
  let latest: AndroidRuntimeEvidence | undefined
  let latestSampling: Record<string, unknown> | undefined
  const backgroundColor = parseHexColor(options.expectation.backgroundColor)
  const textColor = options.expectation.textColor ? parseHexColor(options.expectation.textColor) : undefined
  const density = readAndroidDensity(options.env, options.deviceId)

  while (Date.now() - startedAt < options.timeoutMs) {
    options.ensureRunning()
    const beforeUi = await readAndroidUiHierarchy(options.env, options.deviceId)
    if (restoreAndroidRuntimeForeground(beforeUi, options.env, options.deviceId)) {
      await delay(500)
      continue
    }
    const beforeMarker = readAndroidMarkerSample(beforeUi, options.expectation.markerText)
    if (!beforeMarker || isAndroidDebugShell(beforeUi)) {
      latestSampling = { reason: 'marker-not-visible', uiTextPreview: beforeUi.slice(0, 1000) }
      scrollAndroidViewport(options.env, options.deviceId)
      await delay(500)
      continue
    }
    await captureAndroidScreenshot(options.screenshot, options.env, options.deviceId)
    const uiHierarchy = await readAndroidUiHierarchy(options.env, options.deviceId)
    const afterMarker = readAndroidMarkerSample(uiHierarchy, options.expectation.markerText)
    if (!isSameAndroidMarker(beforeMarker, afterMarker) || isAndroidDebugShell(uiHierarchy)) {
      latestSampling = { reason: 'marker-changed-during-screenshot', beforeMarker, afterMarker }
      await delay(500)
      continue
    }
    const markerBounds = beforeMarker.bounds
    const screenshotChanged = haveAndroidMarkerPixelsChanged(
      PNG.sync.read(await fs.readFile(options.screenshot)),
      options.previousScreenshot ? PNG.sync.read(await fs.readFile(options.previousScreenshot)) : undefined,
      markerBounds,
    )
    if (!screenshotChanged) {
      latestSampling = { reason: 'marker-pixels-unchanged-or-outside-screenshot', markerBounds }
      await delay(500)
      continue
    }
    latestSampling = { reason: 'stable', beforeMarker, afterMarker }
    const background = await analyzeScreenshotColorPresence(options.screenshot, backgroundColor, markerBounds)
    const width = markerBounds.maxX - markerBounds.minX + 1
    const height = markerBounds.maxY - markerBounds.minY + 1
    const text = textColor
      ? await analyzeScreenshotColorPresence(options.screenshot, textColor, markerBounds)
      : undefined
    latest = {
      background,
      density,
      height,
      markerBounds,
      markerTextVisible: true,
      screenshot: options.screenshot,
      screenshotChanged,
      ...(text ? { text } : {}),
      uiTextPreview: uiHierarchy.replace(/\s+/g, ' ').slice(0, 1000),
      width,
    }
    const expectedWidth = options.expectation.width * density
    const expectedHeight = options.expectation.height * density
    const sizeReady = Math.abs(width - expectedWidth) <= 14 * density
      && Math.abs(height - expectedHeight) <= 14 * density
    if (
      background.matched
      && sizeReady
      && screenshotChanged
      && (!textColor || (text?.matchingPixels ?? 0) >= 8)
    ) {
      return latest
    }
    await delay(500)
  }

  throw new Error(`${options.label} 未在 Android 设备呈现预期 marker/style\nexpected=${JSON.stringify(options.expectation)}\nlatest=${JSON.stringify(latest)}\nsampling=${JSON.stringify(latestSampling)}`)
}
