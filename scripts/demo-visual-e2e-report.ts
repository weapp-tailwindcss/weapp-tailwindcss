import type { CaseResult, RuntimeContext, VisualPlatform } from './demo-visual-e2e-report/types.ts'
import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { E2E_PROJECTS } from '../e2e/projectEntries.ts'
import { taroWebHmrCases } from '../e2e/taro-web-demo-hmr-cases.ts'
import { webViteHmrCases } from '../e2e/web-vite-demo-hmr-cases.ts'
import {
  createMiniProgramHmrVisualConfig,
  createTaroHmrVisualConfig,
  createUniH5HmrVisualConfig,
  createWebViteHmrVisualConfig,
} from './demo-visual-e2e-report/hmr.ts'
import { writeReport } from './demo-visual-e2e-report/report.ts'
import { resolveScreenshotsRoot } from './demo-visual-e2e-report/screenshots.ts'
import { formatWorkflowError } from './e2e-preflight/cleanup'

const repoRoot = path.resolve(import.meta.dirname, '..')
const defaultArtifactRoot = 'e2e/.artifacts/demo-visual/full'
const configuredCrossPlatformDiffRatio = Number(process.env['DEMO_VISUAL_MAX_CROSS_PLATFORM_DIFF_RATIO'])
const context: RuntimeContext = {
  artifactRoot: path.resolve(repoRoot, defaultArtifactRoot),
  repoRoot,
  timeoutMs: Number(process.env['DEMO_VISUAL_TIMEOUT_MS'] ?? 180_000),
  viewport: { width: 390, height: 844 },
  ...(Number.isFinite(configuredCrossPlatformDiffRatio) && configuredCrossPlatformDiffRatio >= 0
    ? { maxCrossPlatformDiffRatio: configuredCrossPlatformDiffRatio }
    : {}),
}

const uniH5Cases = [
  'uni-app-vite-tailwindcss-v4',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
].map(name => ({
  name,
  theme: E2E_PROJECTS.find(item => item.name === name)?.theme,
  projectDir: `demo/${name}`,
  command: ['run', 'dev:h5'],
  hmr: createUniH5HmrVisualConfig(repoRoot, name),
  env: {
    CHOKIDAR_INTERVAL: '50',
    CHOKIDAR_USEPOLLING: '1',
    UNI_CLI_SERVER_HOST: '127.0.0.1',
    WEAPP_TW_HMR_TIMING: '1',
  },
}))

function hasArg(name: string) {
  return process.argv.includes(name)
}

function readArgValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readPositionalFilter() {
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--filter') {
      index++
      continue
    }
    if (!arg.startsWith('-')) {
      return arg
    }
  }
  return undefined
}

function printHelp() {
  process.stdout.write([
    'Usage: pnpm exec tsx scripts/demo-visual-e2e-report.ts [options]',
    '',
    'Options:',
    '  --h5-only       只采集 H5 截图',
    '  --weapp-only    只采集小程序截图',
    '  --app-only      只采集 Android/iOS/Harmony App 截图',
    '  --android-only  只采集 Android App 截图',
    '  --ios-only      只采集 iOS App 截图',
    '  --harmony-only  只采集 Harmony App 截图',
    '  --filter <re>   只运行名称匹配的 demo；也可直接传位置参数',
    '  --fail-on-incomplete  任一 case failed/skipped 或没有匹配结果时退出失败',
    '  --help          显示帮助',
    '',
    'Environment:',
    '  HBUILDERX_CHANNEL=auto|stable|alpha  选择 HBuilderX 版本，默认 auto',
    '  HBUILDERX_HOST=<name>              多实例时选择 listhost 返回的 host',
    '  DEMO_VISUAL_IDE_LAUNCH_RETRIES=1    DevTools launch 超时后的重试次数',
    '  DEMO_VISUAL_IDE_SETTLE_MS=800       启动本次项目之前等待时间',
    '  DEMO_VISUAL_IDE_SCREENSHOT_COMMAND_TIMEOUT_MS=30000  单次 DevTools 截图命令超时',
    '  DEMO_VISUAL_HMR_OUTPUT_TIMEOUT_MS    小程序 visual HMR 初始/增量产物等待超时',
    '  DEMO_VISUAL_MAX_CROSS_PLATFORM_DIFF_RATIO  H5 与其他端的最大归一化截图差异比例',
    '',
  ].join('\n'))
}

function matchesFilter(name: string) {
  const filter = readArgValue('--filter') ?? readPositionalFilter() ?? process.env['DEMO_VISUAL_FILTER']
  if (!filter) {
    return true
  }
  return new RegExp(filter).test(name)
}

function hasFilter() {
  return Boolean(readArgValue('--filter') ?? readPositionalFilter() ?? process.env['DEMO_VISUAL_FILTER'])
}

function shouldFailOnIncomplete() {
  return hasArg('--fail-on-incomplete') || process.env['DEMO_VISUAL_FAIL_ON_INCOMPLETE'] === '1'
}

function createMiniProgramCaseOrder(name: string) {
  if (name.includes('hbuilderx')) {
    return 3
  }
  if (name.startsWith('uni-app-x-')) {
    return 2
  }
  if (name.startsWith('uni-app-')) {
    return 1
  }
  return 0
}

function sortMiniProgramCases<T extends { name: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => {
    const orderDiff = createMiniProgramCaseOrder(left.name) - createMiniProgramCaseOrder(right.name)
    return orderDiff || left.name.localeCompare(right.name)
  })
}

function resolveTargetPlatforms() {
  if (hasArg('--h5-only')) {
    return ['h5'] satisfies VisualPlatform[]
  }
  if (hasArg('--weapp-only')) {
    return ['weapp'] satisfies VisualPlatform[]
  }
  if (hasArg('--android-only')) {
    return ['app-android'] satisfies VisualPlatform[]
  }
  if (hasArg('--ios-only')) {
    return ['app-ios'] satisfies VisualPlatform[]
  }
  if (hasArg('--harmony-only')) {
    return ['app-harmony'] satisfies VisualPlatform[]
  }
  if (hasArg('--app-only')) {
    return ['app-android', 'app-ios', 'app-harmony'] satisfies VisualPlatform[]
  }
  return ['h5', 'weapp', 'app-android', 'app-ios', 'app-harmony'] satisfies VisualPlatform[]
}

async function collectTargetDemoNames(platforms: VisualPlatform[]) {
  const names = new Set<string>()
  if (platforms.includes('h5')) {
    for (const item of taroWebHmrCases) {
      names.add(item.projectDir.replace(/^demo\//, ''))
    }
    for (const item of webViteHmrCases) {
      names.add(item.visualName ?? item.projectDir.replace(/^demo\//, ''))
    }
    for (const item of uniH5Cases) {
      names.add(item.name)
    }
  }
  if (platforms.includes('weapp')) {
    for (const item of E2E_PROJECTS) {
      names.add(item.name)
    }
  }
  if (platforms.includes('app-android') || platforms.includes('app-ios') || platforms.includes('app-harmony')) {
    const { uniAppAppCases, uniAppXAppCases } = await import('../e2e/hbuilderx-local/cases.ts')
    for (const item of [...uniAppAppCases, ...uniAppXAppCases]) {
      if (platforms.includes(item.platform)) {
        names.add(path.basename(path.resolve(item.projectDir)))
      }
    }
  }
  return [...names].filter(matchesFilter)
}

async function cleanScreenshotTargets(context: RuntimeContext, platforms: VisualPlatform[], demoNames: string[]) {
  const screenshotsRoot = resolveScreenshotsRoot(context)
  if (platforms.length === 5 && !hasFilter()) {
    await fs.rm(screenshotsRoot, { recursive: true, force: true })
    await fs.mkdir(screenshotsRoot, { recursive: true })
    return
  }

  await fs.mkdir(screenshotsRoot, { recursive: true })
  await Promise.all(demoNames
    .flatMap(name => platforms.flatMap((platform) => {
      const demoRoot = path.join(screenshotsRoot, name)
      return [
        fs.rm(path.join(demoRoot, platform), { recursive: true, force: true }),
        fs.rm(path.join(demoRoot, `${platform}.png`), { force: true }),
        fs.rm(path.join(demoRoot, `${platform}-hmr-before.png`), { force: true }),
        fs.rm(path.join(demoRoot, `${platform}-hmr-after.png`), { force: true }),
      ]
    })))
}

async function main() {
  if (hasArg('--help')) {
    printHelp()
    return
  }
  const results: CaseResult[] = []
  const h5Only = hasArg('--h5-only')
  const weappOnly = hasArg('--weapp-only')
  const appOnly = hasArg('--app-only') || hasArg('--android-only') || hasArg('--ios-only') || hasArg('--harmony-only')
  const targetPlatforms = resolveTargetPlatforms()
  await cleanScreenshotTargets(context, targetPlatforms, await collectTargetDemoNames(targetPlatforms))
  await fs.mkdir(path.join(context.artifactRoot, 'diffs'), { recursive: true })
  if (!weappOnly && !appOnly) {
    const [{ chromium }, { resolveChromeExecutable }, { runH5Case }] = await Promise.all([
      import('playwright'),
      import('../e2e/hbuilderx-local/process.ts'),
      import('./demo-visual-e2e-report/cases.ts'),
    ])
    const executablePath = await resolveChromeExecutable()
    const browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: true,
    })
    try {
      for (const item of taroWebHmrCases) {
        const name = item.projectDir.replace(/^demo\//, '')
        if (!matchesFilter(name)) {
          continue
        }
        await runH5Case(browser, {
          name,
          projectDir: item.projectDir,
          command: ['exec', 'taro', 'build', '--type', 'h5', '--watch', '--host', '127.0.0.1'],
          env: {
            BROWSERSLIST_ENV: 'development',
            CHOKIDAR_INTERVAL: '50',
            CHOKIDAR_USEPOLLING: '1',
            NODE_ENV: 'development',
            TARO_ENV: 'h5',
            WEAPP_TW_HMR_TIMING: '1',
          },
          hmr: createTaroHmrVisualConfig(item),
        }, context, results)
      }
      for (const item of webViteHmrCases) {
        const name = item.visualName ?? item.projectDir.replace(/^demo\//, '')
        if (!matchesFilter(name)) {
          continue
        }
        await runH5Case(browser, {
          name,
          projectDir: item.projectDir,
          command: item.devCommand,
          hmr: createWebViteHmrVisualConfig(item),
        }, context, results)
      }
      for (const item of uniH5Cases) {
        if (!matchesFilter(item.name)) {
          continue
        }
        await runH5Case(browser, item, context, results)
      }
    }
    finally {
      await browser.close()
    }
  }
  if (!h5Only && !appOnly) {
    const { runMiniProgramCase } = await import('./demo-visual-e2e-report/cases.ts')
    for (const item of sortMiniProgramCases(E2E_PROJECTS)) {
      if (!matchesFilter(item.name)) {
        continue
      }
      await runMiniProgramCase({
        ...item,
        url: item.name.startsWith('mpx-') ? '/pages/index' : '/pages/index/index',
        hmr: createMiniProgramHmrVisualConfig(repoRoot, item.name),
      }, context, results)
    }
  }
  if (!h5Only && !weappOnly) {
    const [{ uniAppAppCases, uniAppXAppCases }, { runNativeVisualCases }] = await Promise.all([
      import('../e2e/hbuilderx-local/cases.ts'),
      import('./demo-visual-e2e-report/app-batch.ts'),
    ])
    const items = [...uniAppAppCases, ...uniAppXAppCases].filter((item) => {
      const name = item.name.replace(/\s+(?:android|ios)$/, '')
      if (!matchesFilter(name) && !matchesFilter(item.name)) {
        return false
      }
      if (hasArg('--android-only') && item.platform !== 'app-android') {
        return false
      }
      if (hasArg('--ios-only') && item.platform !== 'app-ios') {
        return false
      }
      if (hasArg('--harmony-only') && item.platform !== 'app-harmony') {
        return false
      }
      if (hasArg('--app-only') && !targetPlatforms.includes(item.platform)) {
        return false
      }
      return true
    })
    await runNativeVisualCases(items, context, results)
  }
  await writeReport(results, context)
  if (shouldFailOnIncomplete()) {
    const incomplete = results.filter(item => item.status !== 'passed')
    if (results.length === 0 || incomplete.length > 0) {
      const details = incomplete
        .map(item => `${item.name} ${item.platform} ${item.status}${item.error ? `: ${item.error}` : ''}`)
        .join('\n')
      throw new Error([
        'demo visual e2e 存在未通过的 case',
        `results=${results.length}`,
        details,
      ].filter(Boolean).join('\n'))
    }
  }
  process.stdout.write(`${JSON.stringify({ artifactRoot: context.artifactRoot, results }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${formatWorkflowError(error)}\n`)
  process.exitCode = 1
})
