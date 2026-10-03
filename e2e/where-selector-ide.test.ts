import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { collectFrameworkIdeDiagnostics } from './frameworkIdeDiagnostics'
import { sampleSelectorPixels } from './where-selector/pixels'

const describeIde = process.env['E2E_IDE'] === '1' ? describe : describe.skip
const timeoutMs = Number(process.env['E2E_IDE_WHERE_SELECTOR_TIMEOUT_MS'] ?? process.env['E2E_AUTOMATOR_TIMEOUT_MS'] ?? 90_000)
const closeTimeoutMs = Number(process.env['E2E_IDE_CLOSE_TIMEOUT_MS'] ?? 5000)
const artifactDir = path.resolve(__dirname, '.artifacts/where-selector')
const fixturesRoot = path.resolve(__dirname, 'fixtures')
const pageUrl = '/pages/index/index'

interface Rect {
  height: number
  left: number
  top: number
  width: number
}

interface ProbeResult {
  bluePixels: number
  compileError?: string
  greenPixels: number
  redPixels: number
  samples?: Record<string, {
    bluePixels: number
    greenPixels: number
    redPixels: number
    targetRect: Rect
  }>
  screenshot?: string
  targetRect?: Rect
}

function fixturePath(name: string) {
  return path.resolve(fixturesRoot, name)
}

async function captureMiniProgramScreenshot(miniProgram: any, screenshotPath: string) {
  return captureMiniProgramViewport(miniProgram, screenshotPath, Math.min(timeoutMs, 30_000))
}

async function readScreenshot(screenshotPath: string) {
  return PNG.sync.read(await fs.readFile(screenshotPath))
}

function isCompileError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /WXSS|文件编译错误|compile|error at token|CssSyntaxError/i.test(message)
}

async function collectNodePixels(page: any, screenshot: PNG, selector: string) {
  const target = await page.$(selector)
  expect(target, `should render ${selector}`).toBeTruthy()
  const targetOffset = await target.offset()
  const targetSize = await target.size()
  const pageSize = await page.size()
  // fixture 的逗号选择器设置 8rpx 顶边，先转换为页面 CSS 像素。
  const borderTopWidth = pageSize.width * 8 / 750
  return sampleSelectorPixels(screenshot, { ...targetOffset, ...targetSize }, pageSize.width, borderTopWidth)
}

async function runProbe(projectName: string, screenshotName: string, selectors: Record<string, string>): Promise<ProbeResult> {
  const projectPath = fixturePath(projectName)
  const automator = new Launcher()
  let miniProgram: any
  try {
    miniProgram = await automator.launch({ cliPath: process.env.E2E_PREFLIGHT_WECHAT_CLI, projectPath, timeout: timeoutMs })
    const page = await miniProgram.reLaunch(pageUrl)
    await page.waitFor(1000)
    const screenshotPath = path.resolve(artifactDir, screenshotName)
    await captureMiniProgramScreenshot(miniProgram, screenshotPath)
    const screenshot = await readScreenshot(screenshotPath)
    const samples: ProbeResult['samples'] = {}
    for (const [name, selector] of Object.entries(selectors)) {
      samples[name] = await collectNodePixels(page, screenshot, selector)
    }
    const firstSample = samples[Object.keys(selectors)[0] ?? '']

    return {
      bluePixels: firstSample?.bluePixels ?? 0,
      greenPixels: firstSample?.greenPixels ?? 0,
      redPixels: firstSample?.redPixels ?? 0,
      samples,
      screenshot: screenshotPath,
      targetRect: firstSample?.targetRect,
    }
  }
  catch (error) {
    if (isCompileError(error)) {
      return {
        bluePixels: 0,
        compileError: error instanceof Error ? error.message : String(error),
        greenPixels: 0,
        redPixels: 0,
      }
    }
    if (error instanceof Error) {
      error.message = `${error.message}\n${await collectFrameworkIdeDiagnostics(projectName)}`
    }
    throw error
  }
  finally {
    await closeWechatProject(projectPath, miniProgram, closeTimeoutMs)
  }
}

async function writeEvidence(fileName: string, evidence: unknown) {
  await fs.mkdir(artifactDir, { recursive: true })
  await fs.writeFile(path.resolve(artifactDir, fileName), `${JSON.stringify(evidence, null, 2)}\n`)
}

describeIde('where selector IDE runtime', () => {
  it('checks raw :where support and verifies class-selector translation in WeChat DevTools', async () => {
    const raw = await runProbe('where-selector-raw-miniprogram', 'raw-where.png', {
      rawWhere: '.where-target',
    })
    const translated = await runProbe('where-selector-translated-miniprogram', 'translated-where.png', {
      groupSelector: '.group-target',
      peerSelector: '.peer-target',
      divideSelector: '.divide-target',
      spaceSelector: '.space-target',
      childTextSelector: '.child-text-target',
      childViewSelector: '.child-view-target',
      themeDescendantSelector: '.theme-descendant-target',
      themeSameNodeSelector: '.theme-same-node-target',
      whereSelector: '.where-target',
    })
    const evidence = {
      raw,
      rawWhereCompiled: !raw.compileError,
      rawWhereMatched: raw.redPixels > 200,
      rawWhereMultiSelectorMatched: raw.bluePixels > 80,
      translated,
      translatedClassSelectorMatched: translated.samples?.whereSelector?.greenPixels
        ? translated.samples.whereSelector.greenPixels > 200
        : false,
      translatedCommaSelectorMatched: (translated.samples?.whereSelector?.bluePixels ?? 0) > 80,
      translatedGroupSelectorMatched: (translated.samples?.groupSelector?.greenPixels ?? 0) > 200,
      translatedPeerSelectorMatched: (translated.samples?.peerSelector?.greenPixels ?? 0) > 200,
      translatedDivideSelectorMatched: (translated.samples?.divideSelector?.greenPixels ?? 0) > 200,
      translatedSpaceSelectorMatched: (translated.samples?.spaceSelector?.greenPixels ?? 0) > 200,
      translatedChildTextSelectorMatched: (translated.samples?.childTextSelector?.greenPixels ?? 0) > 200,
      translatedChildViewSelectorMatched: (translated.samples?.childViewSelector?.greenPixels ?? 0) > 200,
      translatedThemeDescendantSelectorMatched: (translated.samples?.themeDescendantSelector?.greenPixels ?? 0) > 200,
      translatedThemeSameNodeSelectorMatched: (translated.samples?.themeSameNodeSelector?.greenPixels ?? 0) > 200,
    }
    await writeEvidence('where-selector-evidence.json', evidence)

    expect(evidence.translatedClassSelectorMatched, `转译后的普通 class 选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedCommaSelectorMatched, `转译后的逗号普通 class 选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedGroupSelectorMatched, `转译后的 group 普通 class 选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedPeerSelectorMatched, `转译后的 peer 普通 class 选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedDivideSelectorMatched, `转译后的 divide 子节点选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedSpaceSelectorMatched, `转译后的 space 子节点选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedChildTextSelectorMatched, `转译后的 child text 选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedChildViewSelectorMatched, `转译后的 child view 选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedThemeDescendantSelectorMatched, `转译后的主题后代选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
    expect(evidence.translatedThemeSameNodeSelectorMatched, `转译后的主题同节点选择器应在 IDE 中生效: ${JSON.stringify(translated)}`).toBe(true)
  }, 180_000)
})
