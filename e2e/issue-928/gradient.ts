import fs from 'node:fs/promises'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { expect } from 'vitest'
import { captureMiniProgramViewport } from '../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { artifactDir, issue928PageUrl, shouldUpdateIssue928CompareBaseline, timeoutMs } from './config'
import { cropCssPixelRegion } from './css-pixel-region'
import { countBluePixels, countCyanPixels, countPurplePixels, cropPng, expandRect, scaleRect, unionRect } from './visual'

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
  const comparePath = path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-compare.png`)
  await fs.writeFile(comparePath, PNG.sync.write(comparePng))
  let compareBaselineInitialized = false
  let compareBaselineUpdated = false
  let compareDiffPath: string | undefined
  let compareDifferentPixels: number | undefined
  let compareRatio: number | undefined
  if (options.compareBaselinePath) {
    const shouldWriteBaseline = shouldUpdateIssue928CompareBaseline
    if (shouldWriteBaseline) {
      await fs.mkdir(path.dirname(options.compareBaselinePath), { recursive: true })
      await fs.writeFile(options.compareBaselinePath, PNG.sync.write(comparePng))
      compareBaselineInitialized = false
      compareBaselineUpdated = shouldUpdateIssue928CompareBaseline
    }
    const baselinePng = PNG.sync.read(await fs.readFile(options.compareBaselinePath))
    await fs.writeFile(path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-compare-geometry.json`), `${JSON.stringify({
      cssRects,
      compareRect,
      viewportWidth,
      scaleX,
      scaleY,
      screenshot: { width: gradientScreenshot.width, height: gradientScreenshot.height },
      baseline: { width: baselinePng.width, height: baselinePng.height },
      actual: { width: comparePng.width, height: comparePng.height },
    }, null, 2)}\n`)
    expect(Math.abs(baselinePng.width - comparePng.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(baselinePng.height - comparePng.height)).toBeLessThanOrEqual(1)
    const stableCompareWidth = Math.min(comparePng.width, baselinePng.width)
    const stableCompareHeight = Math.min(comparePng.height, baselinePng.height)
    const stableComparePng = cropPng(comparePng, {
      height: stableCompareHeight,
      left: 0,
      top: 0,
      width: stableCompareWidth,
    })
    const stableBaselinePng = cropPng(baselinePng, {
      height: stableCompareHeight,
      left: 0,
      top: 0,
      width: stableCompareWidth,
    })
    const diffPng = new PNG({ width: stableCompareWidth, height: stableCompareHeight })
    compareDifferentPixels = pixelmatch(stableComparePng.data, stableBaselinePng.data, diffPng.data, stableCompareWidth, stableCompareHeight, {
      threshold: 0.1,
    })
    compareDiffPath = path.resolve(artifactDir, `${options.artifactPrefix}-issue-928-compare-diff.png`)
    await fs.writeFile(compareDiffPath, PNG.sync.write(diffPng))
    compareRatio = Math.round((compareDifferentPixels / (stableCompareWidth * stableCompareHeight)) * 10000) / 10000
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
      compareBaselinePath: options.compareBaselinePath,
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

  if (options.compareBaselinePath) {
    expect(compareDifferentPixels).toBeLessThan(10)
  }
}
