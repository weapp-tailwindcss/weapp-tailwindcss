import type { CommandExit, SpawnedHBuilderXCommand } from '../../packages/hbuilderx-runner/src'
import type { AppCase, MiniProgramCase, WebCase } from './cases'
import type { AttachedWebServer } from './web/attached'

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import process from 'node:process'

import path from 'pathe'
import { expect } from 'vitest'
import { createHBuilderXAppProject } from '../../scripts/hbuilderx-app-project'
import { createNativeSessionRecovery } from '../../scripts/hbuilderx-native-session'
import { createHBuilderXProjectAlias as createSharedHBuilderXProjectAlias } from '../../scripts/hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from '../../scripts/hbuilderx-project-lifecycle'
import {
  collectAndroidRuntimeMetadata,
  waitForAndroidRuntimeEvidence,
} from './android-runtime'
import { rewriteAppMarker } from './app-marker'
import { readExistingAppHmrTransformedOutput, readExistingAppTransformedOutput, resolveAppTransformedFiles } from './app-output'
import { bindAppTarget, readAppLaunchOption } from './app-target'
import { rawTailwindDirectiveRE, resolveAppHmrSteps } from './cases'
import { createHarmonyDomProbe } from './harmony-dom-probe'
import { captureHarmonyRuntimeEvidence, waitForHarmonyRuntimeEvidence } from './harmony-runtime'
import { observeHmrStep } from './hmr-lifecycle'
import { waitForIosRuntimeEvidence } from './ios-runtime'
import { captureNativeLog } from './native-log'
import {
  assertAndroidToolchain,
  assertHarmonyToolchain,
  assertIosSimulatorToolchain,
  classifyHBuilderXOutput,
  createLocalHBuilderXRunner,
  fileExists,
  formatRecentLogs,
  hbuilderxAppTimeoutMs,
  hbuilderxTimeoutMs,
  pollIntervalMs,
  readUtf8,
  wait,
} from './process'
import { findMissingRuntimeLogs, resolveAppRuntimeLogContract } from './render-mode'
import { appendHmrSourceMutation, createHmrOutputSnapshot, haveHmrOutputsChanged } from './source-mutations'
import { collectMiniProgramStyleFiles, readReachableMiniProgramStyles, resolveMiniProgramRuntimeStyleEntry } from './styles'
import { runWebHmr } from './web'

const repoRoot = path.resolve(__dirname, '../..')
const HBUILDERX_DEVICE_UNAVAILABLE_RE = /未检测到指定设备|指定设备(?:不存在|不可用|已离线)|(?:device|emulator)[\w-]*\s+(?:not found|offline|unavailable)/i
const HBUILDERX_APP_TERMINATED_RE = /\[plugin:uni:app-uts\]\s*编译失败|运行包制作失败|已停止运行|(?:compile|compilation)\s+failed/i
const allowedWebConsoleWarnings = [
  /^\[vue-router\]: importing from 'vue-router\/dist\/vue-router\.esm-bundler\.js' is deprecated\./,
] as const

export function findHBuilderXDeviceUnavailableLog(output: string) {
  return output.match(HBUILDERX_DEVICE_UNAVAILABLE_RE)?.[0]
}

export function findHBuilderXAppTerminatedLog(output: string) {
  return output.match(HBUILDERX_APP_TERMINATED_RE)?.[0]
}

function resolveAppMarkerAnchors(item: AppCase) {
  return item.markerAnchorCandidates?.length ? item.markerAnchorCandidates : [item.markerAnchor]
}

function resolveWebMarkerAnchors(item: WebCase) {
  return item.markerAnchorCandidates?.length ? item.markerAnchorCandidates : [item.markerAnchor]
}

function expectContent(source: string, entries: Array<string | RegExp>, label: string) {
  for (const entry of entries) {
    if (typeof entry === 'string') {
      expect(source, `${label} 应包含 ${entry}`).toContain(entry)
    }
    else {
      expect(source, `${label} 应匹配 ${entry}`).toMatch(entry)
    }
  }
}

function expectNoContent(source: string, entries: Array<string | RegExp> | undefined, label: string) {
  for (const entry of entries ?? []) {
    if (typeof entry === 'string') {
      expect(source, `${label} 不应包含 ${entry}`).not.toContain(entry)
    }
    else {
      expect(source, `${label} 不应匹配 ${entry}`).not.toMatch(entry)
    }
  }
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

function formatHBuilderXIssueDetails(output: string) {
  const issue = classifyHBuilderXOutput(output)
  return [
    `issue=${issue.kind}: ${issue.message}`,
    issue.hint ? `hint=${issue.hint}` : '',
  ].filter(Boolean).join('\n')
}

async function waitForFile(file: string, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await fileExists(file)) {
      return true
    }
    await wait(pollIntervalMs)
  }
  return false
}

async function hashFile(file: string) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex')
}

async function waitForAppRuntimeLogs(
  item: AppCase,
  logs: string[],
  ensureRunning: () => void,
) {
  const contract = resolveAppRuntimeLogContract(item)
  if (contract.contains.length === 0) {
    return
  }
  const startedAt = Date.now()
  while (Date.now() - startedAt < hbuilderxAppTimeoutMs) {
    ensureRunning()
    if (findMissingRuntimeLogs(logs.join(''), contract.contains).length === 0) {
      return
    }
    await wait(pollIntervalMs)
  }
  throw new Error(`${item.name} 未在 ${hbuilderxAppTimeoutMs}ms 内进入真实 App 运行时或目标渲染模式\nexpected=${contract.contains.map(String).join(' | ')}\nrecentHBuilderXLogs=${formatRecentLogs(logs, 8000)}`)
}

async function resolveAppOutputRoot(item: AppCase) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  for (const outputDir of resolveAppOutputDirCandidates(item)) {
    const outputRoot = path.resolve(projectRoot, outputDir)
    const missing = await findMissingAppFiles(item, outputRoot)
    if (missing.length === 0) {
      return outputRoot
    }
  }
  return path.resolve(projectRoot, item.outputDir)
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

async function readAppTransformedOutput(projectRoot: string, outputRoot: string, item: AppCase) {
  return (
    await Promise.all(
      resolveAppTransformedFiles(projectRoot, outputRoot, item).map(async (target) => {
        const label = path.relative(projectRoot, target) || target
        expect(await waitForFile(target, hbuilderxAppTimeoutMs), `${item.name} 缺少转换产物 ${label}`).toBe(true)
        return await readUtf8(target)
      }),
    )
  ).join('\n')
}

async function readAppStyleOutput(outputRoot: string, item: AppCase) {
  return (
    await Promise.all(
      resolveAppStyleOutputFiles(outputRoot, item).map(async (target) => {
        const label = path.relative(outputRoot, target) || target
        expect(await waitForFile(target, hbuilderxAppTimeoutMs), `${item.name} 缺少样式产物 ${label}`).toBe(true)
        return await readUtf8(target)
      }),
    )
  ).join('\n')
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

async function waitForAppTransformedContent(
  item: AppCase,
  expected: Array<string | RegExp>,
  timeoutMs: number,
  ensureRunning?: () => void,
  createFailureDetails?: () => Promise<string>,
  styleExpected?: Array<string | RegExp>,
  forbidden?: Array<string | RegExp>,
) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const startedAt = Date.now()
  let latest = ''
  let latestStyle = ''

  while (Date.now() - startedAt < timeoutMs) {
    ensureRunning?.()
    for (const outputDir of resolveAppOutputDirCandidates(item)) {
      const outputRoot = path.resolve(projectRoot, outputDir)
      const transformed = await readExistingAppTransformedOutput(projectRoot, outputRoot, item)
      if (!transformed) {
        continue
      }
      latest = transformed
      if (!hasContent(transformed, expected)) {
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
      const forbiddenScope = forbidden?.length
        ? await readExistingAppHmrTransformedOutput(projectRoot, outputRoot, item)
        : transformed
      if (forbiddenScope == null || !hasNoContent(forbiddenScope, forbidden)) {
        continue
      }
      return outputRoot
    }
    await wait(pollIntervalMs)
  }

  const details = await createFailureDetails?.()
  throw new Error(`${item.name} App 热更新产物未包含预期内容\nexpected=${expected.map(String).join(' | ')}\nstyleExpected=${styleExpected?.map(String).join(' | ') ?? ''}\nlatest=${latest.slice(0, 2000)}\nlatestStyle=${latestStyle.slice(0, 2000)}${details ? `\n${details}` : ''}`)
}

async function waitForAppTransformedOutputsRefresh(
  snapshot: Awaited<ReturnType<typeof createHmrOutputSnapshot>>,
  ensureRunning: () => void,
  createFailureDetails: () => string,
) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < hbuilderxAppTimeoutMs) {
    ensureRunning()
    if (await haveHmrOutputsChanged(snapshot)) {
      return
    }
    await wait(pollIntervalMs)
  }
  throw new Error(`HBuilderX App 样式源码保存后转换产物未刷新\n${createFailureDetails()}`)
}

async function assertMiniProgramOutput(
  item: MiniProgramCase,
  ensureRunning?: () => void,
  createFailureDetails?: () => string,
) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  let outputRoot = path.resolve(projectRoot, item.outputDir)

  const startedAt = Date.now()
  while (Date.now() - startedAt < hbuilderxTimeoutMs) {
    ensureRunning?.()
    for (const outputDir of item.outputDirCandidates ?? [item.outputDir]) {
      const candidateRoot = path.resolve(projectRoot, outputDir)
      const ready = await Promise.all(item.requiredFiles.map(file => fileExists(path.resolve(candidateRoot, file))))
      if (ready.every(Boolean)) {
        outputRoot = candidateRoot
        break
      }
    }
    if ((await Promise.all(item.requiredFiles.map(file => fileExists(path.resolve(outputRoot, file))))).every(Boolean)) {
      break
    }
    await wait(pollIntervalMs)
  }

  for (const file of item.requiredFiles) {
    const target = path.resolve(outputRoot, file)
    expect(
      await waitForFile(target, hbuilderxTimeoutMs),
      `${item.name} 缺少产物 ${file}${createFailureDetails ? `\n${createFailureDetails()}` : ''}`,
    ).toBe(true)
  }

  const styleFiles = await collectMiniProgramStyleFiles(outputRoot, item.cssExtensions)
  expect(
    styleFiles.length,
    `${item.name} 缺少 ${item.cssExtensions.join('/')} 样式产物`,
  ).toBeGreaterThan(0)
  const runtimeStyleEntry = await resolveMiniProgramRuntimeStyleEntry(outputRoot, item.cssExtensions)
  expect(runtimeStyleEntry, `${item.name} 无法唯一识别小程序运行时根样式入口`).toBeTruthy()
  // 根入口需要沿导入链验证；分包样式由页面路由加载，不会出现在根入口的导入图中。
  const runtimeCss = await readReachableMiniProgramStyles(outputRoot, runtimeStyleEntry!, item.cssExtensions)
  expect(runtimeCss, `${item.name} 根样式入口不可读`).not.toBe('')
  const css = (await Promise.all(styleFiles.map(readUtf8))).join('\n')

  expectContent(css, item.cssContains, item.name)
  if (item.outputContains) {
    for (const [file, entries] of Object.entries(item.outputContains)) {
      const target = path.resolve(outputRoot, file)
      expect(await waitForFile(target, hbuilderxTimeoutMs), `${item.name} 缺少产物 ${file}`).toBe(true)
      expectContent(await readUtf8(target), entries, `${item.name} ${file}`)
    }
  }
  if (item.outputNotContains) {
    for (const [file, entries] of Object.entries(item.outputNotContains)) {
      const target = path.resolve(outputRoot, file)
      expect(await waitForFile(target, hbuilderxTimeoutMs), `${item.name} 缺少产物 ${file}`).toBe(true)
      const content = await readUtf8(target)
      for (const entry of entries) {
        if (typeof entry === 'string') {
          expect(content, `${item.name} ${file} 不应包含 ${entry}`).not.toContain(entry)
        }
        else {
          expect(content, `${item.name} ${file} 不应匹配 ${entry}`).not.toMatch(entry)
        }
      }
    }
  }
  if (item.cssNotContains) {
    for (const entry of item.cssNotContains) {
      if (typeof entry === 'string') {
        expect(css, `${item.name} 不应包含 ${entry}`).not.toContain(entry)
      }
      else {
        expect(css, `${item.name} 不应匹配 ${entry}`).not.toMatch(entry)
      }
    }
  }
}

async function assertAppOutput(item: AppCase) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const outputRoot = await resolveAppOutputRoot(item)

  for (const file of item.requiredFiles) {
    const target = path.resolve(outputRoot, file)
    expect(await waitForFile(target, hbuilderxAppTimeoutMs), `${item.name} 缺少产物 ${file}`).toBe(true)
  }

  const transformed = await readAppTransformedOutput(projectRoot, outputRoot, item)
  expectContent(transformed, item.transformedContains, `${item.name} App 转换产物`)
  if (item.compiledStyleContains?.length) {
    expectContent(transformed, item.compiledStyleContains, `${item.name} App 编译样式产物`)
  }
  expectNoContent(transformed, item.transformedNotContains, `${item.name} App 转换产物`)
  if (item.styleContains?.length) {
    const style = await readAppStyleOutput(outputRoot, item)
    expectContent(style, item.styleContains, `${item.name} App 样式产物`)
    expectNoContent(style, item.styleNotContains, `${item.name} App 样式产物`)
  }
}

async function assertAppOutputHasNoUnsupportedContent(item: AppCase, outputRoot: string) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const transformed = await readAppTransformedOutput(projectRoot, outputRoot, item)
  expectNoContent(transformed, item.transformedNotContains, `${item.name} App 转换产物`)
  if (item.styleOutputFiles?.length) {
    const style = await readAppStyleOutput(outputRoot, item)
    expectNoContent(style, item.styleNotContains, `${item.name} App 样式产物`)
  }
}

async function findMissingAppFiles(item: AppCase, outputRoot?: string) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const root = outputRoot ?? path.resolve(projectRoot, item.outputDir)
  const missing: string[] = []

  for (const file of item.requiredFiles) {
    if (!(await fileExists(path.resolve(root, file)))) {
      missing.push(file)
    }
  }

  return missing
}

async function findReadyAppOutputRoot(item: AppCase) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  for (const outputDir of resolveAppOutputDirCandidates(item)) {
    const outputRoot = path.resolve(projectRoot, outputDir)
    const missing = await findMissingAppFiles(item, outputRoot)
    if (missing.length > 0) {
      continue
    }
    const transformed = await readExistingAppTransformedOutput(projectRoot, outputRoot, item)
    const style = item.styleContains?.length ? await readExistingAppStyleOutput(outputRoot, item) : ''
    if (
      transformed
      && hasContent(transformed, item.transformedContains)
      && (item.styleContains?.length ? style != null && hasContent(style, item.styleContains) : true)
    ) {
      return outputRoot
    }
  }
  return undefined
}

async function cleanAppOutput(item: AppCase) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const targets = [
    ...resolveAppOutputDirCandidates(item).map(outputDir => path.resolve(projectRoot, outputDir)),
    ...resolveAppIntermediateOutputTargets(item, projectRoot),
    ...(item.transformedFiles ?? []).map(file => path.resolve(projectRoot, file)),
  ]

  await Promise.all(
    [...new Set(targets)].map(async (target) => {
      await rmWithRetry(target)
    }),
  )
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

export async function compileMiniProgramWithHBuilderX(item: MiniProgramCase) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const outputDirs = item.outputDirCandidates ?? [item.outputDir]

  await Promise.all(
    [...new Set(outputDirs)].map(async (outputDir) => {
      await fs.rm(path.resolve(projectRoot, outputDir), { recursive: true, force: true })
    }),
  )

  const hbuilderx = await createLocalHBuilderXRunner(projectRoot, { WEAPP_TW_HMR_TIMING: '1' })
  const projectAlias = await createSharedHBuilderXProjectAlias(projectRoot)
  await withHBuilderXProjectCleanup(projectAlias, async () => {
    await hbuilderx.run({
      args: ['project', 'open', '--path', projectAlias.projectPath],
      cwd: projectRoot,
      timeoutMs: hbuilderxTimeoutMs,
    })
    const launch = await hbuilderx.run({
      args: ['launch', item.platform, '--project', projectAlias.projectName, '--compile', 'true'],
      cwd: projectRoot,
      timeoutMs: hbuilderxTimeoutMs,
    })
    if (launch.issue.kind !== 'unknown') {
      throw new Error([
        `${item.name} HBuilderX 编译失败：${launch.issue.message}`,
        launch.issue.hint,
        launch.output,
      ].filter(Boolean).join('\n'))
    }
    await assertMiniProgramOutput(item)
  }, () => hbuilderx.run({
    args: ['project', 'close', '--path', projectAlias.projectPath],
    allowFailure: false,
    cwd: projectRoot,
    timeoutMs: hbuilderxTimeoutMs,
  }))
}

export async function verifyAppHmrWithHBuilderX(item: AppCase) {
  item = bindAppTarget(item)
  let androidEnv: Record<string, string> | undefined
  const launchArgs = [...(item.launchArgs ?? [])]
  if (item.platform === 'app-android') {
    androidEnv = assertAndroidToolchain()
  }
  if (item.platform === 'app-ios') {
    assertIosSimulatorToolchain()
  }
  if (item.platform === 'app-harmony') {
    assertHarmonyToolchain()
  }

  let projectRoot = path.resolve(repoRoot, item.projectDir)
  const hbuilderx = await createLocalHBuilderXRunner(projectRoot, {
    WEAPP_TW_HMR_TIMING: '1',
    ...androidEnv,
    ...item.launchEnv,
  })
  let sourceFile = path.resolve(projectRoot, item.sourceFile)
  const runtimeEvidenceRoot = process.env['E2E_HBUILDERX_RUNTIME_EVIDENCE_ROOT']
    ? path.resolve(process.env['E2E_HBUILDERX_RUNTIME_EVIDENCE_ROOT'], item.name.replace(/[^\w-]+/g, '-'))
    : path.resolve(os.tmpdir(), 'weapp-tailwindcss-hbuilderx-runtime', `${process.pid}-${item.name.replace(/[^\w-]+/g, '-')}`)
  const domProbe = item.platform === 'app-harmony' && item.renderMode === 'vapor' ? createHarmonyDomProbe() : undefined
  let logs: string[] = []
  let domObserver: ReturnType<NonNullable<typeof domProbe>['observe']> | undefined
  let nativeLog: ReturnType<typeof captureNativeLog> | undefined
  const domOptions = domProbe ? { readDomProbe: () => domObserver?.read() } : {}
  let projectSession: Awaited<ReturnType<typeof createHBuilderXAppProject>> | undefined
  const recovery = await createNativeSessionRecovery({
    directory: runtimeEvidenceRoot,
    projectRoot,
    platform: item.platform,
    host: hbuilderx.resolution,
    files: [sourceFile, ...resolveAppHmrSteps(item).flatMap(step => step.sourceMutation ? [path.resolve(projectRoot, step.sourceMutation.file)] : [])].map(file => ({ file })),
  })
  let harmonyFailureEvidence: Parameters<typeof captureHarmonyRuntimeEvidence>[0] | undefined
  let hmrLifecycle: ReturnType<typeof observeHmrStep> | undefined
  let launch: SpawnedHBuilderXCommand | undefined
  let failure: { error: unknown } | undefined
  try {
    projectSession = await createHBuilderXAppProject({ projectRoot, platform: item.platform, runner: hbuilderx, timeoutMs: hbuilderxAppTimeoutMs, env: androidEnv })
    projectRoot = projectSession.projectRoot
    sourceFile = path.resolve(projectRoot, item.sourceFile)
    await recovery.bindProject(projectSession)
    recovery.beginMutation()
    await writeAppMarker(sourceFile, resolveAppMarkerAnchors(item), {
      className: item.markerClass,
      textClassName: item.markerTextClass,
      text: item.markerText,
    })
    if (domProbe) {
      await fs.writeFile(sourceFile, domProbe.inject(await readUtf8(sourceFile)), 'utf8')
    }
    await fs.mkdir(runtimeEvidenceRoot, { recursive: true })
    await cleanAppOutput(item)
    await projectSession.open()
    launch = hbuilderx.spawn({
      args: ['launch', item.platform, '--project', projectSession.launchProject, '--cleanCache', 'true', ...launchArgs],
      cwd: projectRoot,
      env: {
        WEAPP_TW_HMR_TIMING: '1',
        ...androidEnv,
        ...item.launchEnv,
      },
    })
    const { child } = launch
    nativeLog = captureNativeLog(child, path.resolve(runtimeEvidenceRoot, 'hbuilderx.log'))
    domObserver = domProbe?.observe(child)
    logs = launch.logs
    let exit: CommandExit | undefined
    void launch.closed.then((result) => {
      exit = result
    })

    const startedAt = Date.now()
    const ensureLaunchRunning = () => {
      const output = logs.join('')
      const unavailableDevice = findHBuilderXDeviceUnavailableLog(output)
      if (unavailableDevice) {
        throw new Error(`HBuilderX 未找到可用运行设备：${unavailableDevice}\n${output}`)
      }
      const terminated = findHBuilderXAppTerminatedLog(output)
      if (terminated) {
        throw new Error(`HBuilderX App 运行已终止：${terminated}\n${formatRecentLogs(logs, 20_000)}`)
      }
      const issue = classifyHBuilderXOutput(output)
      if (issue.kind === 'project-type-unsupported') {
        throw new Error(`HBuilderX App 运行目标不受支持：${issue.message}\n${issue.hint ?? ''}\n${formatRecentLogs(logs, 20_000)}`)
      }
      if (exit && exit.code !== 0) {
        throw new Error(`命令失败：HBuilderX ${hbuilderx.resolution.channel} launch ${item.platform} exit=${exit.signal ?? exit.code}\n${formatHBuilderXIssueDetails(output)}\n${formatRecentLogs(logs, 20_000)}`)
      }
    }
    let initialOutputRoot: string | undefined
    while (Date.now() - startedAt < hbuilderxAppTimeoutMs) {
      initialOutputRoot = await findReadyAppOutputRoot(item)
      if (initialOutputRoot) {
        break
      }
      ensureLaunchRunning()
      await wait(pollIntervalMs)
    }
    if (!initialOutputRoot) {
      throw new Error(`${item.name} App 初始开发产物未在 ${hbuilderxAppTimeoutMs}ms 内就绪\n${formatRecentLogs(logs, 20_000)}`)
    }

    await assertAppOutput(item)
    if (exit) {
      throw new Error(`HBuilderX app dev process exited before hot-update mutation: exit=${exit.signal ?? exit.code}\n${formatRecentLogs(logs, 20_000)}`)
    }
    await waitForAppRuntimeLogs(item, logs, ensureLaunchRunning)
    const androidDeviceId = item.platform === 'app-android'
      ? readAppLaunchOption(launchArgs, '--deviceId')
      : undefined
    const harmonyDeviceId = readAppLaunchOption(launchArgs, '--deviceId')
    const initialHarmony = item.platform === 'app-harmony'
      ? await waitForHarmonyRuntimeEvidence({
          ...domOptions,
          deviceId: harmonyDeviceId,
          directory: path.resolve(runtimeEvidenceRoot, 'initial'),
          marker: item.markerText,
          timeoutMs: hbuilderxAppTimeoutMs,
          ensureRunning: ensureLaunchRunning,
        })
      : undefined
    let previousRuntimeScreenshot: string | undefined
    let previousRuntimeMarkerClass = item.markerClass
    if (item.platform === 'app-android' && item.runtime) {
      const initialScreenshot = path.resolve(runtimeEvidenceRoot, 'initial.png')
      const evidence = await waitForAndroidRuntimeEvidence({
        deviceId: androidDeviceId,
        ensureRunning: ensureLaunchRunning,
        env: androidEnv,
        expectation: item.runtime,
        label: `${item.name} initial`,
        screenshot: initialScreenshot,
        timeoutMs: hbuilderxAppTimeoutMs,
      })
      previousRuntimeScreenshot = evidence.screenshot
      process.stdout.write(`${JSON.stringify({
        hbuilderx: hbuilderx.resolution,
        outputRoot: initialOutputRoot,
        runtime: collectAndroidRuntimeMetadata(androidEnv, androidDeviceId),
        runtimeEvidence: evidence,
      })}\n`)
    }
    else if (item.platform === 'app-android') {
      process.stdout.write(`[hbuilderx-app] ${item.name} 未配置 Android 运行时探针，保留产物/HMR 断言\n`)
    }
    else if (item.platform === 'app-ios') {
      const evidence = await waitForIosRuntimeEvidence({
        deviceId: readAppLaunchOption(launchArgs, '--deviceId'),
        ensureRunning: ensureLaunchRunning,
        markerClass: item.markerClass,
        screenshot: path.resolve(runtimeEvidenceRoot, 'initial.png'),
        timeoutMs: hbuilderxAppTimeoutMs,
      })
      previousRuntimeScreenshot = evidence.screenshot
      process.stdout.write(`${JSON.stringify({ runtimeEvidence: evidence })}\n`)
    }
    let hmrOutputRoot = initialOutputRoot
    for (const step of resolveAppHmrSteps(item)) {
      hmrLifecycle?.assertNoFallback()
      hmrLifecycle?.dispose()
      hmrLifecycle = observeHmrStep(child, item.platform, item.updateMode)
      harmonyFailureEvidence = initialHarmony ? { ...domOptions, deviceId: harmonyDeviceId, directory: path.resolve(runtimeEvidenceRoot, step.name), marker: step.markerText } : undefined
      process.stdout.write(`[hbuilderx-app-hmr] ${item.name} step=${step.name} start\n`)
      if (step.sourceMutation) {
        const shouldWaitForOutputRefresh = step.sourceMutation.expectOutputRefresh !== false
        const outputSnapshot = shouldWaitForOutputRefresh
          ? await createHmrOutputSnapshot(resolveAppTransformedFiles(projectRoot, hmrOutputRoot, item))
          : undefined
        await appendHmrSourceMutation(projectRoot, step.sourceMutation)
        if (outputSnapshot) {
          await waitForAppTransformedOutputsRefresh(outputSnapshot, ensureLaunchRunning, () => [
            `step=${step.name}:source-mutation`,
            `source=${step.sourceMutation!.file}`,
            `recentHBuilderXLogs=${formatRecentLogs(logs, 4000)}`,
          ].join('\n'))
        }
      }
      await writeAppMarker(sourceFile, resolveAppMarkerAnchors(item), {
        className: step.markerClass,
        text: step.markerText,
        ...(step.markerTextClass ? { textClassName: step.markerTextClass } : {}),
      })
      hmrOutputRoot = await waitForAppTransformedContent(item, step.transformedContains, hbuilderxAppTimeoutMs, ensureLaunchRunning, async () => {
        const source = await readUtf8(sourceFile)
        return [
          `step=${step.name}`,
          `source=${path.relative(projectRoot, sourceFile)}`,
          `sourceTail=${source.slice(-1200)}`,
          `recentHBuilderXLogs=${formatRecentLogs(logs, 4000)}`,
        ].join('\n')
      }, step.styleContains, [...(item.transformedNotContains ?? []), ...(step.transformedNotContains ?? [])])
      const iosEvidence = await hmrLifecycle.waitForCompletion(hbuilderxAppTimeoutMs, ensureLaunchRunning, item.platform === 'app-ios'
        ? remainingMs => waitForIosRuntimeEvidence({
          deviceId: readAppLaunchOption(launchArgs, '--deviceId'),
          ensureRunning: () => {
            ensureLaunchRunning()
            hmrLifecycle?.assertNoFallback()
          },
          markerClass: step.markerClass,
          previous: { screenshot: previousRuntimeScreenshot!, markerClass: previousRuntimeMarkerClass },
          screenshot: path.resolve(runtimeEvidenceRoot, `${step.name}.png`),
          timeoutMs: remainingMs,
        })
        : undefined)
      if (iosEvidence) {
        previousRuntimeScreenshot = iosEvidence.screenshot
        previousRuntimeMarkerClass = step.markerClass
        process.stdout.write(`${JSON.stringify({ step: step.name, runtimeEvidence: iosEvidence })}\n`)
      }
      if (initialHarmony) {
        const evidence = await waitForHarmonyRuntimeEvidence({
          ...domOptions,
          deviceId: harmonyDeviceId,
          directory: path.resolve(runtimeEvidenceRoot, step.name),
          marker: step.markerText,
          previousPid: initialHarmony.pid,
          timeoutMs: hbuilderxAppTimeoutMs,
          ensureRunning: () => {
            ensureLaunchRunning()
            hmrLifecycle?.assertNoFallback()
          },
        })
        process.stdout.write(`${JSON.stringify({ step: step.name, runtimeEvidence: evidence })}\n`)
      }
      if (item.platform === 'app-android' && step.runtime) {
        const screenshot = path.resolve(runtimeEvidenceRoot, `${step.name}.png`)
        const evidence = await waitForAndroidRuntimeEvidence({
          deviceId: androidDeviceId,
          ensureRunning: ensureLaunchRunning,
          env: androidEnv,
          expectation: step.runtime,
          label: `${item.name} ${step.name}`,
          previousScreenshot: previousRuntimeScreenshot,
          screenshot,
          timeoutMs: hbuilderxAppTimeoutMs,
        })
        if (previousRuntimeScreenshot) {
          expect(
            await hashFile(evidence.screenshot),
            `${item.name} ${step.name} 热更新前后截图应发生变化`,
          ).not.toBe(await hashFile(previousRuntimeScreenshot))
        }
        process.stdout.write(`${JSON.stringify({
          outputRoot: hmrOutputRoot,
          previousRuntimeScreenshot,
          runtimeEvidence: evidence,
          step: step.name,
        })}\n`)
        previousRuntimeScreenshot = evidence.screenshot
      }
      else if (item.platform === 'app-android') {
        process.stdout.write(`[hbuilderx-app-hmr] ${item.name} step=${step.name} 未配置 Android 运行时探针，保留产物/HMR 断言\n`)
      }
      hmrLifecycle?.assertNoFallback()
      process.stdout.write(`${JSON.stringify({ step: step.name, updateLifecycle: hmrLifecycle.snapshot() })}\n`)
      process.stdout.write(`[hbuilderx-app-hmr] ${item.name} step=${step.name} ${item.platform === 'app-ios' ? '当轮编译、同步与可见样式标记检查通过（未验证节点文字）' : '产物与传输检查通过'}\n`)
    }
    await assertAppOutputHasNoUnsupportedContent(item, hmrOutputRoot)
    expectNoContent(logs.join(''), item.logNotContains, `${item.name} HBuilderX 日志`)
    expectNoContent(logs.join(''), resolveAppRuntimeLogContract(item).notContains, `${item.name} HBuilderX 渲染模式日志`)
  }
  catch (error) {
    failure = { error }
    if (harmonyFailureEvidence) {
      await captureHarmonyRuntimeEvidence(harmonyFailureEvidence).catch((captureError) => {
        failure = { error: new AggregateError([error, captureError], 'Harmony 验证与失败现场取证均失败。', { cause: error }) }
      })
    }
  }
  finally {
    try {
      await recovery.cleanup({
        failure,
        stop: async () => { await launch?.stop('SIGINT') },
        nativeStopReason: () => hmrLifecycle?.nativeStopReason(),
        afterStop: () => hmrLifecycle?.assertNoFallback(),
        safe: [() => hmrLifecycle?.dispose(), () => domObserver?.dispose(), async () => { await nativeLog?.close() }],
        release: [async () => { await projectSession?.cleanup() }],
      })
    }
    catch (error) {
      failure = { error: failure
        ? new AggregateError([failure.error, error], 'HBuilderX App 验证与收尾均失败。', { cause: failure.error })
        : error }
    }
    process.stdout.write(`[hbuilderx-app] 原始日志：${path.resolve(runtimeEvidenceRoot, 'hbuilderx.log')}\n`)
  }
  if (failure) {
    throw failure.error
  }
}

export async function verifyWebHmr(item: WebCase, attached?: AttachedWebServer) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  const result = await runWebHmr(projectRoot, path.resolve(projectRoot, item.sourceFile), resolveWebMarkerAnchors(item), item.initialCssPath, item.hmrCssPath, item.initialCssContains, item.initialRuntimeStyles, item.persistentRuntimeStyles, item.hmrSteps, item.launchWithHBuilderX, item.initialTextContains, item.serverIdentityPath, attached)

  expect(result.pageHtml, `${item.name} Web 首页应可访问`).toContain('<!DOCTYPE html>')
  expect(result.pageErrors, `${item.name} Web 页面不应产生控制台错误`).toEqual([])
  expect(result.pageOverlayText, `${item.name} Web 页面不应显示 Vite 错误遮罩`).toBeUndefined()
  const unexpectedWarnings = result.pageWarnings.filter(warning => !allowedWebConsoleWarnings.some(pattern => pattern.test(warning)))
  expect(unexpectedWarnings, `${item.name} Web 页面不应产生非预期控制台警告`).toEqual([])
  expect(result.initialCss, `${item.name} 不应保留 Tailwind 原始指令`).not.toMatch(rawTailwindDirectiveRE)
  for (const css of result.hmrCss) {
    expect(css, `${item.name} HMR CSS 不应保留 Tailwind 原始指令`).not.toMatch(rawTailwindDirectiveRE)
  }
  if (item.nativeIdeVersionRequired && !attached) {
    expect(result.serverLogs, `${item.name} CLI 应提供原生 IDE 版本`).toMatch(/HBuilderX Version:\s*5\./)
  }
  expectContent(result.serverLogs, item.serverLogContains ?? [], `${item.name} Web HBuilderX 服务日志`)
  expectNoContent(result.serverLogs, item.serverLogNotContains, `${item.name} Web Vite 服务日志`)
}
