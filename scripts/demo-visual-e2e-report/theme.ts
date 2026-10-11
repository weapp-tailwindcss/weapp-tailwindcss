import type { Page } from 'playwright'
import type { PNG } from 'pngjs'
import type { MiniProgramThemeExpectation } from './types'
import fs from 'node:fs/promises'
import path from 'pathe'
import postcss from 'postcss'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface MiniProgramThemeCssEvidence {
  cssFiles: string[]
  hasManualDarkSelector: boolean
  hasUnsupportedThemeAttributeSelector: boolean
  hasUnsupportedThemeComplexSelector: boolean
  hasSystemDarkMedia: boolean
}

function collectCssSelectors(css: string) {
  const selectors: string[] = []
  postcss.parse(css).walkRules((rule) => {
    selectors.push(...rule.selectors)
  })
  return selectors
}

function isThemeSelector(selector: string) {
  return /(?:^|[\s.])(?:theme-dark|system-dark|dark)_c/.test(selector) || /(?:^|[\s.])theme-dark(?:[\s.:#]|$)/.test(selector)
}

export function analyzeThemeCss(css: string): Omit<MiniProgramThemeCssEvidence, 'cssFiles'> {
  const selectors = collectCssSelectors(css)
  const themeSelectors = selectors.filter(isThemeSelector)
  const selectorText = selectors.join('\n')
  const themeSelectorText = themeSelectors.join('\n')
  return {
    hasManualDarkSelector: /\.theme-dark(?:\s|\.)/.test(selectorText) || /\.(?:theme-dark|dark)_c\S+\.theme-dark/.test(selectorText),
    hasUnsupportedThemeAttributeSelector: themeSelectors.some(selector => /\[[^\]]+\]/.test(selector)),
    hasUnsupportedThemeComplexSelector: /:(?:where|not)\(/.test(themeSelectorText),
    hasSystemDarkMedia: /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/.test(css),
  }
}

export function countDarkPixels(png: PNG, rect: Rect) {
  const left = Math.max(0, Math.floor(rect.left))
  const top = Math.max(0, Math.floor(rect.top))
  const right = Math.min(png.width, Math.ceil(rect.left + rect.width))
  const bottom = Math.min(png.height, Math.ceil(rect.top + rect.height))
  let pixels = 0

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = (png.width * y + x) * 4
      const red = png.data[index] ?? 255
      const green = png.data[index + 1] ?? 255
      const blue = png.data[index + 2] ?? 255
      const alpha = png.data[index + 3] ?? 255

      if (alpha > 180 && red < 40 && green < 45 && blue < 55) {
        pixels++
      }
    }
  }

  return pixels
}

function countTotalDarkPixels(png: PNG) {
  return countDarkPixels(png, {
    height: png.height,
    left: 0,
    top: 0,
    width: png.width,
  })
}

function parseRgb(value: string) {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value)
  if (!match) {
    return undefined
  }
  return {
    blue: Number(match[3]),
    green: Number(match[2]),
    red: Number(match[1]),
  }
}

function parseOklchLightness(value: string) {
  const match = /oklch\(\s*([\d.]+)/.exec(value)
  if (!match) {
    return undefined
  }
  return Number(match[1])
}

function isDarkColor(value: string) {
  const color = parseRgb(value)
  const lightness = parseOklchLightness(value)
  return Boolean((color && color.red < 40 && color.green < 45 && color.blue < 55) || (lightness !== undefined && lightness < 0.35))
}

function isLightColor(value: string) {
  const color = parseRgb(value)
  const lightness = parseOklchLightness(value)
  return Boolean((color && color.red > 220 && color.green > 220 && color.blue > 220) || (lightness !== undefined && lightness > 0.85))
}

function isLightText(value: string) {
  const color = parseRgb(value)
  const lightness = parseOklchLightness(value)
  return Boolean((color && color.red > 220 && color.green > 220 && color.blue > 220) || (lightness !== undefined && lightness > 0.85))
}

function ensureH5ThemeEvidence(evidence: Awaited<ReturnType<typeof readH5ThemeEvidence>>, expectation?: Pick<MiniProgramThemeExpectation, 'backgroundColor'>) {
  if (!evidence.found) {
    throw new Error('H5 主题视觉回归缺少 .theme-mode-demo')
  }
  if (!evidence.manualDark.found) {
    throw new Error('H5 主题视觉回归缺少 .theme-dark 手动暗色示例')
  }
  if (!isLightColor(evidence.light.backgroundColor)) {
    throw new Error(`H5 亮色状态背景不符合预期: ${evidence.light.backgroundColor}`)
  }
  if (!isDarkColor(evidence.rootManualDark.backgroundColor) || !isLightText(evidence.rootManualDark.color)) {
    throw new Error(
      `H5 theme-dark class 切换未让根示例变暗: background=${evidence.rootManualDark.backgroundColor}, color=${evidence.rootManualDark.color}`,
    )
  }
  const manualColor = parseRgb(evidence.manualDark.backgroundColor)
  const matchesManualBackground = expectation
    ? Boolean(manualColor && expectation.backgroundColor.every((channel, index) => channel === [manualColor.red, manualColor.green, manualColor.blue][index]))
    : isDarkColor(evidence.manualDark.backgroundColor)
  if (!matchesManualBackground || !isLightText(evidence.manualDark.color)) {
    throw new Error(
      `H5 手动暗色示例不符合主题预期: background=${evidence.manualDark.backgroundColor}, color=${evidence.manualDark.color}, expected=${expectation?.backgroundColor.join(',') ?? 'dark'}`,
    )
  }
}

async function readH5ThemeEvidence(page: Page) {
  return await page.evaluate(`(() => {
    const demo = document.querySelector('.theme-mode-demo')
    const pick = (el) => {
      if (!el) {
        return {
          backgroundColor: '',
          className: '',
          color: '',
          found: false,
          text: '',
        }
      }
      const style = getComputedStyle(el)
      return {
        backgroundColor: style.backgroundColor,
        className: el.getAttribute('class') ?? '',
        color: style.color,
        found: true,
        text: el.textContent?.trim().slice(0, 120) ?? '',
      }
    }
    const hadThemeDark = demo?.classList.contains('theme-dark') ?? false
    const light = pick(demo)
    const manualDark = pick(demo?.querySelector('.theme-dark') ?? null)
    demo?.classList.add('theme-dark')
    const rootManualDark = pick(demo)
    if (demo && !hadThemeDark) {
      demo.classList.remove('theme-dark')
    }

    return {
      found: Boolean(demo),
      light,
      manualDark,
      rootManualDark,
    }
  })()`)
}

export async function collectH5ThemeEvidence(page: Page, expectation?: Pick<MiniProgramThemeExpectation, 'backgroundColor'>) {
  const startedAt = Date.now()
  let evidence = await readH5ThemeEvidence(page)
  while (!evidence.found && Date.now() - startedAt < 30_000) {
    await page.waitForTimeout(150)
    evidence = await readH5ThemeEvidence(page)
  }
  ensureH5ThemeEvidence(evidence, expectation)
  return evidence
}

export async function captureH5ManualDarkScreenshot(page: Page, screenshot: string) {
  await fs.mkdir(path.dirname(screenshot), { recursive: true })
  await page.evaluate(`(() => {
    document.querySelector('.theme-mode-demo')?.classList.add('theme-dark')
  })()`)
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
  await page.evaluate(`(() => {
    document.querySelector('.theme-mode-demo')?.classList.remove('theme-dark')
  })()`)
}

export async function collectMiniProgramThemeCssEvidence(projectPath: string, cssFiles: string[]) {
  const candidates = [...new Set([...cssFiles.map(file => path.resolve(projectPath, file)), ...await collectWxssFiles(projectPath)])]
  const readableFiles: string[] = []
  const cssParts: string[] = []
  for (const file of candidates) {
    const css = await fs.readFile(file, 'utf8').catch(() => '')
    if (!css) {
      continue
    }
    readableFiles.push(file)
    cssParts.push(css)
  }
  const evidence = {
    cssFiles: readableFiles,
    ...analyzeThemeCss(cssParts.join('\n')),
  }
  if (!evidence.hasSystemDarkMedia) {
    throw new Error(`小程序主题 CSS 缺少 prefers-color-scheme 暗色媒体查询: ${readableFiles.join(', ')}`)
  }
  if (!evidence.hasManualDarkSelector) {
    throw new Error(`小程序主题 CSS 缺少 .theme-dark 手动暗色 class 选择器: ${readableFiles.join(', ')}`)
  }
  if (evidence.hasUnsupportedThemeAttributeSelector) {
    throw new Error(`小程序主题 CSS 仍包含不兼容的属性选择器: ${readableFiles.join(', ')}`)
  }
  if (evidence.hasUnsupportedThemeComplexSelector) {
    throw new Error(`小程序主题 CSS 仍包含不兼容的复杂选择器: ${readableFiles.join(', ')}`)
  }
  return evidence
}

async function collectWxssFiles(dir: string) {
  const files: string[] = []
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(file)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.wxss')) {
        files.push(file)
      }
    }
  }
  await walk(projectPathSafe(dir))
  return files.sort()
}

function projectPathSafe(dir: string) {
  return path.resolve(dir)
}

async function queryFirstElement(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const element = await page?.$(selector).catch(() => undefined)
    if (element) {
      return element
    }
  }
}

export async function collectMiniProgramThemeWxmlEvidence(page: any, wxml: string, expectation?: MiniProgramThemeExpectation) {
  const root = await queryFirstElement(page, ['.theme-mode-demo'])
  const manual = await queryFirstElement(page, ['.theme-dark', '.theme-dark_cbg-zinc-950', '.dark_cbg-zinc-950'])
  const rootClassName = await root?.attribute?.('class').catch(() => '') ?? ''
  const manualClassName = await manual?.attribute?.('class').catch(() => '') ?? ''
  const evidence = {
    hasThemeDarkClass: /\btheme-dark\b/.test(wxml) || /\btheme-dark\b/.test(manualClassName),
    hasManualDarkClass: expectation
      ? manualClassName.split(/\s+/).includes(expectation.manualClass) || wxml.includes(expectation.manualClass)
      : /(?:theme-dark|dark)_cbg-zinc-950/.test(wxml) || /(?:theme-dark|dark).*bg-zinc-950/.test(manualClassName),
    hasRootSystemDarkClass: /system-dark_cbg-slate-900/.test(wxml) || /system-dark.*bg-slate-900/.test(rootClassName),
    hasThemeDemo: /theme-mode-demo/.test(wxml) || Boolean(root),
    manualClassName,
    rootClassName,
  }
  if (!evidence.hasThemeDemo) {
    throw new Error('小程序 IDE 主题视觉回归缺少 .theme-mode-demo')
  }
  if (!evidence.hasThemeDarkClass) {
    throw new Error('小程序 IDE 主题视觉回归缺少 theme-dark 手动暗色 class')
  }
  if (!evidence.hasManualDarkClass) {
    throw new Error(`小程序 IDE 手动暗色示例缺少暗色类: ${manualClassName}`)
  }
  if (!evidence.hasRootSystemDarkClass) {
    throw new Error(`小程序 IDE 系统暗色示例缺少 system-dark 类: ${rootClassName}`)
  }
  return evidence
}

function scaleRect(rect: Rect, scaleX: number, scaleY: number): Rect {
  return {
    height: rect.height * scaleY,
    left: rect.left * scaleX,
    top: rect.top * scaleY,
    width: rect.width * scaleX,
  }
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    height: rect.height + padding * 2,
    left: rect.left - padding,
    top: rect.top - padding,
    width: rect.width + padding * 2,
  }
}

async function readElementRect(element: any) {
  const offset = await element?.offset?.().catch(() => undefined)
  const size = await element?.size?.().catch(() => undefined)
  if (!offset || !size) {
    return undefined
  }
  return {
    height: Number(size.height ?? 0),
    left: Number(offset.left ?? 0),
    top: Number(offset.top ?? 0),
    width: Number(size.width ?? 0),
  }
}

export async function collectMiniProgramThemeScreenshotEvidence(page: any, png: PNG, geometry?: {
  rootRect: Rect
  manualRect: Rect
  windowWidth: number
}, expectation?: MiniProgramThemeExpectation) {
  const pageSize = geometry ? { width: geometry.windowWidth } : await page?.size?.().catch(() => undefined)
  const root = geometry ? undefined : await queryFirstElement(page, ['.theme-mode-demo'])
  const manual = geometry ? undefined : await queryFirstElement(page, ['.theme-dark', '.theme-dark_cbg-zinc-950', '.dark_cbg-zinc-950'])
  const rootRect = geometry?.rootRect ?? await readElementRect(root)
  const manualRect = geometry?.manualRect ?? await readElementRect(manual)
  if (!pageSize || !rootRect || !manualRect || manualRect.width <= 0 || manualRect.height <= 0) {
    throw new Error('小程序 IDE 主题视觉回归无法读取暗色示例节点位置')
  }

  const scaleX = png.width / Number(pageSize.width)
  const scaleY = scaleX
  const manualScreenshotRect = expandRect(scaleRect(manualRect, scaleX, scaleY), -2)
  const manualDarkPixels = expectation
    ? countThemeColorPixels(png, manualScreenshotRect, expectation.backgroundColor)
    : countDarkPixels(png, manualScreenshotRect)
  const minDarkPixels = Math.max(120, Math.floor(manualScreenshotRect.width * manualScreenshotRect.height * 0.2))
  const screenshotDarkPixels = countTotalDarkPixels(png)
  const minScreenshotDarkPixels = Math.max(120, Math.floor(png.width * png.height * 0.005))
  const evidence = {
    manualDarkPixels,
    expectedBackgroundColor: expectation?.backgroundColor ?? [9, 9, 11],
    manualRect,
    manualScreenshotRect,
    minDarkPixels,
    minScreenshotDarkPixels,
    pageSize,
    rootRect,
    screenshotDarkPixels,
    scaleX,
    scaleY,
  }
  if (manualDarkPixels < minDarkPixels) {
    throw new Error(
      `小程序 IDE 手动暗色示例截图暗色像素不足: rect=${manualDarkPixels}/${minDarkPixels}, screenshot=${screenshotDarkPixels}/${minScreenshotDarkPixels}`,
    )
  }
  return evidence
}

export function countThemeColorPixels(png: PNG, rect: Rect, color: [number, number, number]) {
  let pixels = 0
  for (let y = Math.max(0, Math.ceil(rect.top)); y < Math.min(png.height, Math.floor(rect.top + rect.height)); y++) {
    for (let x = Math.max(0, Math.ceil(rect.left)); x < Math.min(png.width, Math.floor(rect.left + rect.width)); x++) {
      const index = (y * png.width + x) * 4
      if (png.data[index + 3]! > 180 && color.every((channel, offset) => Math.abs(png.data[index + offset]! - channel) <= 8)) {
        pixels++
      }
    }
  }
  return pixels
}
