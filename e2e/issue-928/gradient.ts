import type { Issue928BaselinePaths } from './baseline'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { expect } from 'vitest'
import { captureMiniProgramViewport } from '../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { compareIssue928Baseline, selectIssue928Baseline } from './baseline'
import { artifactDir, issue928PageUrl, shouldUpdateIssue928CompareBaseline, timeoutMs } from './config'
import { cropCssPixelRegion } from './css-pixel-region'
import { countBluePixels, countCyanPixels, countPurplePixels, expandRect, scaleRect, unionRect } from './visual'

interface Issue928ProbeOptions {
  artifactPrefix: string
  coveredIssue: string
  expectedPrimaryClass: string
  expectedViaClass: string
  gradientSelector: string
  viaSelector: string
  stopSelector: string
  radialSelector: string
  conicSelector: string
  arbitraryImageSelector: string
  compareBaselinePath?: string
  compareBaselinePaths?: Issue928BaselinePaths
  extraVisualAssertions?: (context: {
    screenshot: PNG
    scaleX: number
    scaleY: number
    page: any
  }) => Promise<Record<string, unknown>>
}

async function collectScaledRect(page: any, screenshot: PNG, node: any, padding = 2) {
  const pageSize = await page.size()
  const scaleX = screenshot.width / pageSize.width
  const scaleY = scaleX
  return {
    rect: expandRect(scaleRect({ ...await node.offset(), ...await node.size() }, scaleX, scaleY), padding),
    scaleX,
    scaleY,
  }
}

export async function assertIssue928GradientRuntime(miniProgram: any, options: Issue928ProbeOptions) {
  const gradientPage = await miniProgram.reLaunch(issue928PageUrl)
  await gradientPage.waitFor(1000)

  const gradientNode = await gradientPage.$(options.gradientSelector)
  const viaGradientNode = await gradientPage.$(options.viaSelector)
  const stopArbitraryGradientNode = await gradientPage.$(options.stopSelector)
  const radialGradientNode = await gradientPage.$(options.radialSelector)
  const conicGradientNode = await gradientPage.$(options.conicSelector)
  const arbitraryImageGradientNode = await gradientPage.$(options.arbitraryImageSelector)

  expect(gradientNode).toBeTruthy()
  expect(viaGradientNode).toBeTruthy()
  expect(stopArbitraryGradientNode).toBeTruthy()
  expect(radialGradientNode).toBeTruthy()
  expect(conicGradientNode).toBeTruthy()
  expect(arbitraryImageGradientNode).toBeTruthy()
  await expect(gradientNode.attribute('class')).resolves.toContain(options.expectedPrimaryClass)
  await expect(viaGradientNode.attribute('class')).resolves.toContain(options.expectedViaClass)
  await expect(stopArbitraryGradientNode.attribute('class')).resolves.toContain('from-')

  const gradientScreenshotPath = path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-gradient.png`)
  await captureMiniProgramViewport(miniProgram, gradientScreenshotPath, Math.min(timeoutMs, 30_000))
  const gradientScreenshot = PNG.sync.read(await fs.readFile(gradientScreenshotPath))
  const { rect: gradientRect, scaleX, scaleY } = await collectScaledRect(gradientPage, gradientScreenshot, gradientNode)
  const { rect: viaGradientRect } = await collectScaledRect(gradientPage, gradientScreenshot, viaGradientNode)
  const { rect: stopArbitraryGradientRect } = await collectScaledRect(gradientPage, gradientScreenshot, stopArbitraryGradientNode)
  const { rect: radialGradientRect } = await collectScaledRect(gradientPage, gradientScreenshot, radialGradientNode)
  const { rect: conicGradientRect } = await collectScaledRect(gradientPage, gradientScreenshot, conicGradientNode)
  const { rect: arbitraryImageGradientRect } = await collectScaledRect(gradientPage, gradientScreenshot, arbitraryImageGradientNode)
  const gradientBluePixels = countBluePixels(gradientScreenshot, gradientRect)
  const gradientCyanPixels = countCyanPixels(gradientScreenshot, gradientRect)
  const viaGradientPurplePixels = countPurplePixels(gradientScreenshot, viaGradientRect)
  const stopArbitraryGradientBluePixels = countBluePixels(gradientScreenshot, stopArbitraryGradientRect)
  const stopArbitraryGradientCyanPixels = countCyanPixels(gradientScreenshot, stopArbitraryGradientRect)
  const stopArbitraryGradientPurplePixels = countPurplePixels(gradientScreenshot, stopArbitraryGradientRect)
  const radialGradientPurplePixels = countPurplePixels(gradientScreenshot, radialGradientRect)
  const conicGradientPurplePixels = countPurplePixels(gradientScreenshot, conicGradientRect)
  const arbitraryImageGradientBluePixels = countBluePixels(gradientScreenshot, arbitraryImageGradientRect)
  expect(gradientCyanPixels).toBeGreaterThan(100)
  expect(gradientBluePixels).toBeGreaterThan(100)
  expect(viaGradientPurplePixels).toBeGreaterThan(100)
  expect(stopArbitraryGradientCyanPixels).toBeGreaterThan(100)
  expect(stopArbitraryGradientBluePixels).toBeGreaterThan(100)
  const cssRects = await Promise.all([gradientNode, viaGradientNode, stopArbitraryGradientNode].map(async node => ({
    ...await node.offset(),
    ...await node.size(),
  })))
  const compareRect = expandRect(unionRect(...cssRects), 2)
  const viewportWidth = (await gradientPage.size()).width
  const comparePng = cropCssPixelRegion(gradientScreenshot, viewportWidth, compareRect, { requireIntegerScale: true })
  const baselinePaths = options.compareBaselinePaths ?? (options.compareBaselinePath ? { 2: options.compareBaselinePath } : undefined)
  const compareBaseline = baselinePaths ? selectIssue928Baseline(gradientScreenshot.width, viewportWidth, baselinePaths) : undefined
  const comparePath = path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-compare.png`)
  await fs.writeFile(comparePath, PNG.sync.write(comparePng))
  let compareBaselineInitialized = false
  let compareBaselineUpdated = false
  let compareDiffPath: string | undefined
  let compareDifferentPixels: number | undefined
  let compareRatio: number | undefined
  if (compareBaseline) {
    const shouldWriteBaseline = shouldUpdateIssue928CompareBaseline
    if (shouldWriteBaseline) {
      await fs.mkdir(path.dirname(compareBaseline.path), { recursive: true })
      await fs.writeFile(compareBaseline.path, PNG.sync.write(comparePng))
      compareBaselineInitialized = false
      compareBaselineUpdated = shouldUpdateIssue928CompareBaseline
    }
    const baselinePng = PNG.sync.read(await fs.readFile(compareBaseline.path))
    await fs.writeFile(path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-compare-geometry.json`), `${JSON.stringify({
      cssRects,
      compareRect,
      viewportWidth,
      scaleX,
      scaleY,
      screenshot: { width: gradientScreenshot.width, height: gradientScreenshot.height },
      baseline: { width: baselinePng.width, height: baselinePng.height },
      actual: { width: comparePng.width, height: comparePng.height },
      compareBaselinePath: compareBaseline.path,
      compareBaselineScale: compareBaseline.scale,
    }, null, 2)}\n`)
    const comparison = compareIssue928Baseline(comparePng, baselinePng)
    compareDifferentPixels = comparison.differentPixels
    compareDiffPath = path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-compare-diff.png`)
    await fs.writeFile(compareDiffPath, PNG.sync.write(comparison.diff))
    compareRatio = comparison.ratio
  }
  const extraVisual = await options.extraVisualAssertions?.({
    page: gradientPage,
    scaleX,
    scaleY,
    screenshot: gradientScreenshot,
  }) ?? {}

  await fs.writeFile(
    path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-gradient-visual.json`),
    `${JSON.stringify({
      arbitraryImageGradientBluePixels,
      arbitraryImageGradientRect,
      conicGradientPurplePixels,
      conicGradientRect,
      coveredIssues: [options.coveredIssue],
      gradientBluePixels,
      gradientCyanPixels,
      gradientRect,
      compareDiffPath,
      compareBaselineInitialized,
      compareBaselinePath: compareBaseline?.path,
      compareBaselineScale: compareBaseline?.scale,
      compareBaselineUpdated,
      compareDifferentPixels,
      comparePath,
      compareRatio,
      radialGradientPurplePixels,
      radialGradientRect,
      scaleX,
      scaleY,
      screenshot: gradientScreenshotPath,
      stopArbitraryGradientBluePixels,
      stopArbitraryGradientCyanPixels,
      stopArbitraryGradientPurplePixels,
      stopArbitraryGradientRect,
      viaGradientPurplePixels,
      viaGradientRect,
      ...extraVisual,
    }, null, 2)}\n`,
  )

  if (compareBaseline) {
    expect(compareDifferentPixels).toBeLessThan(10)
  }
}
