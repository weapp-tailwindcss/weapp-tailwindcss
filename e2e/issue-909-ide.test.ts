import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { collectFrameworkIdeDiagnostics } from './frameworkIdeDiagnostics'
import { artifactDir, issue928BaselineDir, timeoutMs } from './issue-928/config'
import { assertIssue928GradientRuntime } from './issue-928/gradient'
import { countAmberPixels, countBluePixels, countCyanPixels, countEmeraldPixels, countPurplePixels, countRedPixels, countYellowPixels, expandRect, scaleRect } from './issue-928/visual'
import { assertMiniProgramPreflight } from './preflight-assertions'

import { ensureProjectBuilt } from './projectBuild'

const describeIde = process.env['E2E_IDE'] === '1' ? describe : describe.skip
const v4ProjectRoot = path.resolve(__dirname, '../demo/taro-webpack-react-tailwindcss-v4')
const v4ProjectPath = v4ProjectRoot
const v4AppWxssPath = path.resolve(v4ProjectRoot, 'dist/app.wxss')
const issue909PageUrl = '/pages/issue-909/index'
const isTailwindcssV4GradientFallbackEnabled = process.env['WEAPP_TW_V4_GRADIENT_FALLBACK'] === '1'
const transformClasses = [
  'rotate-y-90',
  'rotate-y-45',
  '-rotate-y-45',
  'rotate-x-45',
  'rotate-z-45',
]
const gradientClasses = [
  'bg-linear-to-r',
  'bg-linear-to-tr',
  'bg-linear-65',
  'bg-radial',
  'bg-conic',
  'bg-conic-180',
  'from-cyan-500',
  'via-purple-500',
  'to-blue-500',
]
const coveredIssues = [
  '#909 Tailwind v4 transform variable fallbacks',
  '#916 native mini-program tag selector preservation',
  '#928 Tailwind v4 gradient stop fallbacks',
]

async function captureMiniProgramScreenshot(miniProgram: any, screenshotPath: string) {
  return captureMiniProgramViewport(miniProgram, screenshotPath, Math.min(timeoutMs, 30_000))
}

async function readScreenshot(screenshotPath: string) {
  return PNG.sync.read(await fs.readFile(screenshotPath))
}

function toCssSelector(className: string) {
  return new RegExp(`\\.${className.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\{`)
}

describeIde('issues 909/916/928 IDE runtime', () => {
  let miniProgram: any

  beforeAll(async () => {
    if (process.env['E2E_SKIP_BUILD'] !== '1') {
      await ensureProjectBuilt(v4ProjectRoot)
    }
    try {
      const automator = new Launcher()
      miniProgram = await automator.launch({ cliPath: process.env.E2E_PREFLIGHT_WECHAT_CLI, projectPath: v4ProjectPath, timeout: timeoutMs })
    }
    catch (error) {
      if (error instanceof Error) {
        error.message = `${error.message}\n${await collectFrameworkIdeDiagnostics('issue-909')}`
      }
      throw error
    }
  }, 180_000)

  afterAll(async () => {
    if (miniProgram) {
      await closeWechatProject(v4ProjectPath, miniProgram)
    }
  })

  it('keeps Tailwind v4 transform, native selector and gradient utilities valid in WeChat DevTools', async () => {
    const appWxss = await fs.readFile(v4AppWxssPath, 'utf8')
    for (const className of transformClasses) {
      expect(appWxss).toMatch(toCssSelector(className))
    }
    for (const className of gradientClasses) {
      expect(appWxss).toMatch(toCssSelector(className))
    }
    expect(appWxss).toMatch(/transform:\s*var\(--tw-rotate-x, \) var\(--tw-rotate-y, \) var\(--tw-rotate-z, \) var\(--tw-skew-x, \) var\(--tw-skew-y, \)/)
    expect(appWxss).not.toMatch(/transform:\s*var\(--tw-rotate-x,\) var\(--tw-rotate-y,\)/)
    assertMiniProgramPreflight(appWxss)
    expect(appWxss).toMatch(/background-image:\s*linear-gradient\(var\(--tw-gradient-stops\)\)/)
    const bgLinearToRRule = appWxss.match(/\.bg-linear-to-r\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations
    expect(bgLinearToRRule, 'issue 928 should emit the variable-driven gradient rule').toBeTruthy()
    expect(bgLinearToRRule).toMatch(/--tw-gradient-position:\s*to right;/)
    expect(bgLinearToRRule).toMatch(/background-image:\s*linear-gradient\(var\(--tw-gradient-stops\)\)/)
    // 小程序主产物按前缀白名单清理冗余的 -webkit-linear-gradient。
    expect(bgLinearToRRule).not.toContain('-webkit-linear-gradient')
    if (isTailwindcssV4GradientFallbackEnabled) {
      expect(appWxss).toContain('.bg-linear-to-r.from-cyan-500.to-blue-500')
      expect(appWxss).toContain('background-image: linear-gradient(to right, #06b6d4, #3b82f6)')
      expect(appWxss).toContain('background-image: linear-gradient(to right, #06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image: linear-gradient(to right, var(--issue-928-from), var(--issue-928-via), var(--issue-928-to))')
      expect(appWxss).toContain('background-image: linear-gradient(to top right, #06b6d4 10%, #a855f7 30%, #3b82f6 90%)')
      expect(appWxss).toContain('background-image: linear-gradient(65deg, #34d399, #fde047, #f43f5e)')
      expect(appWxss).toContain('background-image: radial-gradient(#06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image: radial-gradient(at 50% 75%, #06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image: conic-gradient(#06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image: conic-gradient(from 180deg, #06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image: conic-gradient(from -180deg, #06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image: linear-gradient(25deg,#ef4444 5%,#eab308 60%,#22c55e 90%,#14b8a6)')
      expect(appWxss).toContain('background-image: conic-gradient(from 45deg at 50% 50%,#ef4444,#eab308,#22c55e)')
    }
    else {
      expect(appWxss).not.toContain('.bg-linear-to-r.from-cyan-500.to-blue-500')
      expect(appWxss).not.toContain('background-image: linear-gradient(to right, #06b6d4, #3b82f6)')
      expect(appWxss).not.toContain('background-image: linear-gradient(to right, #06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).not.toContain('background-image: radial-gradient(#06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).not.toContain('background-image: conic-gradient(#06b6d4, #a855f7, #3b82f6)')
      expect(appWxss).toContain('background-image:linear-gradient(var(--tw-gradient-stops,25deg,#ef4444 5%,#eab308 60%,#22c55e 90%,#14b8a6))')
      expect(appWxss).toContain('background-image:conic-gradient(var(--tw-gradient-stops,from 45deg at 50% 50%,#ef4444,#eab308,#22c55e))')
    }
    expect(appWxss).toContain('background-image:linear-gradient(90deg,#06b6d4,#3b82f6)')
    expect(appWxss, 'issue 928 should keep mini-program parseable gradient via fallback')
      .toMatch(/--tw-gradient-stops:var\(--tw-gradient-via-stops,\s*var\(--tw-gradient-position\)\),/)
    expect(appWxss, 'issue 928 should keep from-position comma-space fallback in gradient stops')
      .toContain('var(--tw-gradient-from) var(--tw-gradient-from-position, )')
    expect(appWxss, 'issue 928 should keep to-position comma-space fallback in gradient stops')
      .toContain('var(--tw-gradient-to) var(--tw-gradient-to-position, )')
    expect(appWxss).not.toContain('var(--tw-gradient-from-position,),')
    expect(appWxss).not.toContain('var(--tw-gradient-to-position,),')
    expect(appWxss).not.toContain('var(--tw-gradient-from-position),')
    expect(appWxss).not.toContain('var(--tw-gradient-to-position);')
    expect(appWxss).not.toContain('--tw-gradient-via-stops: initial')
    expect(appWxss).not.toContain('to right in oklab')
    expect(appWxss).not.toContain('var(--tw-gradient-via-stops, var(--tw-gradient-position),')

    const page = await miniProgram.reLaunch(issue909PageUrl)
    await page.waitFor(1000)
    const controlNode = await page.$('.issue-909-box-control')
    const rotateNode = await page.$('.issue-909-box-rotate-y-90')
    const rotateY45Node = await page.$('.issue-909-box-rotate-y-45')
    const negativeRotateY45Node = await page.$('.issue-909-box-negative-rotate-y-45')
    const rotateX45Node = await page.$('.issue-909-box-rotate-x-45')
    const rotateZ45Node = await page.$('.issue-909-box-rotate-z-45')
    const nativeSelectorNode = await page.$('.issue-916-native-selector-box')
    expect(controlNode).toBeTruthy()
    expect(rotateNode).toBeTruthy()
    expect(rotateY45Node).toBeTruthy()
    expect(negativeRotateY45Node).toBeTruthy()
    expect(rotateX45Node).toBeTruthy()
    expect(rotateZ45Node).toBeTruthy()
    expect(nativeSelectorNode).toBeTruthy()

    const className = await rotateNode.attribute('class')
    expect(className).toContain('rotate-y-90')
    await expect(rotateY45Node.attribute('class')).resolves.toContain('rotate-y-45')
    await expect(negativeRotateY45Node.attribute('class')).resolves.toContain('-rotate-y-45')
    await expect(rotateX45Node.attribute('class')).resolves.toContain('rotate-x-45')
    await expect(rotateZ45Node.attribute('class')).resolves.toContain('rotate-z-45')

    const nativeSelectorSize = await nativeSelectorNode.size()
    expect(Math.round(nativeSelectorSize.width)).toBe(80)
    expect(Math.round(nativeSelectorSize.height)).toBe(80)

    const screenshotPath = path.resolve(artifactDir, 'issues-909-916.png')
    await captureMiniProgramScreenshot(miniProgram, screenshotPath)
    const screenshot = await readScreenshot(screenshotPath)
    const pageSize = await page.size()
    const controlOffset = await controlNode.offset()
    const controlSize = await controlNode.size()
    const rotateOffset = await rotateNode.offset()
    const rotateSize = await rotateNode.size()
    const nativeSelectorOffset = await nativeSelectorNode.offset()
    const scaleX = screenshot.width / pageSize.width
    const scaleY = scaleX
    const controlRect = expandRect(scaleRect({ ...controlOffset, ...controlSize }, scaleX, scaleY), 4)
    const rotateRect = expandRect(scaleRect({ ...rotateOffset, ...rotateSize }, scaleX, scaleY), 4)
    const nativeSelectorRect = expandRect(scaleRect({ ...nativeSelectorOffset, ...nativeSelectorSize }, scaleX, scaleY), 4)
    const controlEmeraldPixels = countEmeraldPixels(screenshot, controlRect)
    const rotateEmeraldPixels = countEmeraldPixels(screenshot, rotateRect)
    const nativeSelectorAmberPixels = countAmberPixels(screenshot, nativeSelectorRect)
    const visibleRatio = rotateEmeraldPixels / Math.max(controlEmeraldPixels, 1)

    await fs.writeFile(
      path.resolve(artifactDir, 'issues-909-916-visual.json'),
      `${JSON.stringify({
        className,
        controlEmeraldPixels,
        controlRect,
        coveredIssues: coveredIssues.slice(0, 2),
        demonstratedClasses: transformClasses,
        nativeSelectorAmberPixels,
        nativeSelectorRect,
        nativeSelectorSize,
        rotateEmeraldPixels,
        rotateRect,
        scaleX,
        scaleY,
        screenshot: screenshotPath,
        visibleRatio,
      }, null, 2)}\n`,
    )

    expect(controlEmeraldPixels).toBeGreaterThan(500)
    expect(rotateEmeraldPixels).toBeLessThan(controlEmeraldPixels * 0.2)
    expect(visibleRatio).toBeLessThan(0.2)
    expect(nativeSelectorAmberPixels).toBeGreaterThan(800)

    await assertIssue928GradientRuntime(miniProgram, {
      artifactPrefix: 'v4',
      coveredIssue: coveredIssues[2]!,
      expectedPrimaryClass: 'bg-linear-to-r',
      expectedViaClass: 'via-purple-500',
      gradientSelector: '.issue-928-gradient',
      viaSelector: '.issue-928-linear-via',
      stopSelector: '.issue-928-stop-arbitrary',
      radialSelector: '.issue-928-radial-custom',
      conicSelector: '.issue-928-conic-angle',
      arbitraryImageSelector: '.issue-928-arbitrary-image',
      compareBaselinePath: path.resolve(issue928BaselineDir, 'v4-compare.png'),
      extraVisualAssertions: async ({ page, scaleX, scaleY, screenshot }) => {
        const stopVarGradientNode = await page.$('.issue-928-stop-var')
        const arbitraryGradientNode = await page.$('.issue-928-linear-custom')
        const imageVarGradientNode = await page.$('.issue-928-image-var')
        const directEmptyFallbackNode = await page.$('.issue-928-direct-empty-fallback')
        const directEmptyFallbackNoSpaceNode = await page.$('.issue-928-direct-empty-fallback-no-space')
        expect(stopVarGradientNode).toBeTruthy()
        expect(arbitraryGradientNode).toBeTruthy()
        expect(imageVarGradientNode).toBeTruthy()
        expect(directEmptyFallbackNode).toBeTruthy()
        expect(directEmptyFallbackNoSpaceNode).toBeTruthy()
        await expect(stopVarGradientNode.attribute('class')).resolves.toContain('from-')
        await expect(arbitraryGradientNode.attribute('class')).resolves.toContain('bg-linear-')
        await expect(imageVarGradientNode.attribute('class')).resolves.toContain('bg-')
        const stopVarGradientRect = expandRect(scaleRect({ ...await stopVarGradientNode.offset(), ...await stopVarGradientNode.size() }, scaleX, scaleY), 2)
        const arbitraryGradientRect = expandRect(scaleRect({ ...await arbitraryGradientNode.offset(), ...await arbitraryGradientNode.size() }, scaleX, scaleY), 2)
        const imageVarGradientRect = expandRect(scaleRect({ ...await imageVarGradientNode.offset(), ...await imageVarGradientNode.size() }, scaleX, scaleY), 2)
        const directEmptyFallbackRect = expandRect(scaleRect({ ...await directEmptyFallbackNode.offset(), ...await directEmptyFallbackNode.size() }, scaleX, scaleY), 2)
        const directEmptyFallbackNoSpaceRect = expandRect(scaleRect({ ...await directEmptyFallbackNoSpaceNode.offset(), ...await directEmptyFallbackNoSpaceNode.size() }, scaleX, scaleY), 2)
        const stopVarGradientPurplePixels = countPurplePixels(screenshot, stopVarGradientRect)
        const arbitraryGradientRedPixels = countRedPixels(screenshot, arbitraryGradientRect)
        const arbitraryGradientYellowPixels = countYellowPixels(screenshot, arbitraryGradientRect)
        const imageVarGradientBluePixels = countBluePixels(screenshot, imageVarGradientRect)
        const directEmptyFallbackCyanPixels = countCyanPixels(screenshot, directEmptyFallbackRect)
        const directEmptyFallbackBluePixels = countBluePixels(screenshot, directEmptyFallbackRect)
        const directEmptyFallbackNoSpaceCyanPixels = countCyanPixels(screenshot, directEmptyFallbackNoSpaceRect)
        const directEmptyFallbackNoSpaceBluePixels = countBluePixels(screenshot, directEmptyFallbackNoSpaceRect)
        return {
          arbitraryGradientRedPixels,
          arbitraryGradientRect,
          arbitraryGradientYellowPixels,
          directEmptyFallbackBluePixels,
          directEmptyFallbackCyanPixels,
          directEmptyFallbackNoSpaceBluePixels,
          directEmptyFallbackNoSpaceCyanPixels,
          directEmptyFallbackNoSpaceRect,
          directEmptyFallbackRect,
          gradientClasses,
          imageVarGradientBluePixels,
          imageVarGradientRect,
          stopVarGradientPurplePixels,
          stopVarGradientRect,
        }
      },
    })
  }, 120_000)

  it('keeps Tailwind v4 gradient utilities valid in WeChat DevTools', async () => {
    const appWxss = await fs.readFile(v4AppWxssPath, 'utf8')
    expect(appWxss).toContain('.bg-gradient-to-r')
    expect(appWxss).toContain('.from-cyan-500')
    expect(appWxss).toContain('.via-purple-500')
    expect(appWxss).toContain('.to-blue-500')
    expect(appWxss).toMatch(/background-image:\s*linear-gradient\(var\(--tw-gradient-stops\)\)/)
    expect(appWxss).toMatch(/--tw-gradient-stops:var\(--tw-gradient-via-stops,\s*var\(--tw-gradient-position\)\),var\(--tw-gradient-from\) var\(--tw-gradient-from-position, \),var\(--tw-gradient-to\) var\(--tw-gradient-to-position, \)/)
    expect(appWxss).toContain('--tw-gradient-via-stops:var(--tw-gradient-position),var(--tw-gradient-from) var(--tw-gradient-from-position, ),var(--tw-gradient-via) var(--tw-gradient-via-position, ),var(--tw-gradient-to) var(--tw-gradient-to-position, )')
    expect(appWxss).toContain('background-image:linear-gradient(90deg,#06b6d4,#3b82f6)')
    expect(appWxss).toContain('background-image:radial-gradient(var(--tw-gradient-stops))')
    expect(appWxss).toContain('background-image:conic-gradient(var(--tw-gradient-stops))')

    await assertIssue928GradientRuntime(miniProgram, {
      artifactPrefix: 'v4-standalone',
      coveredIssue: '#928 Tailwind v4 gradient stop fallbacks',
      expectedPrimaryClass: 'bg-linear-to-r',
      expectedViaClass: 'via-purple-500',
      gradientSelector: '.issue-928-gradient',
      viaSelector: '.issue-928-linear-via',
      stopSelector: '.issue-928-stop-arbitrary',
      radialSelector: '.issue-928-radial-custom',
      conicSelector: '.issue-928-conic-angle',
      arbitraryImageSelector: '.issue-928-arbitrary-image',
      compareBaselinePath: path.resolve(issue928BaselineDir, 'v4-compare.png'),
    })
  }, 120_000)
})
