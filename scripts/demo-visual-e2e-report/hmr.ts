import type { Page } from 'playwright'
import type { WebCase, WebRuntimeStyleAssertion } from '../../e2e/hbuilderx-local/cases.ts'
import type { TaroWebHmrCase } from '../../e2e/taro-web-demo-hmr-cases.ts'
import type { WebViteHmrCase } from '../../e2e/web-vite-demo-hmr-cases.ts'
import type { H5HmrVisualConfig } from './cases.ts'
import type { MiniProgramHmrMutation, MiniProgramHmrVisualConfig, VisualHmrStep } from './types.ts'
import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { webCases } from '../../e2e/hbuilderx-local/cases.ts'
import { appendHmrSourceMutation, createHmrSourceRestore } from '../../e2e/hbuilderx-local/source-mutations.ts'
import { sameSourceFile } from '../../e2e/hbuilderx-local/web/identity.ts'
import { matchRuntimeStyles, readRuntimeStyles } from '../../e2e/hbuilderx-local/web/runtime.ts'
import { rewriteHmrMarker } from '../../e2e/hbuilderx-local/web/source.ts'
import { buildCases } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/index.ts'
import { writeFilePreserveEol } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text.ts'

const pollIntervalMs = 150
const hmrTimeoutMs = Number(process.env['DEMO_VISUAL_HMR_TIMEOUT_MS'] ?? process.env['DEMO_VISUAL_TIMEOUT_MS'] ?? 180_000)
export const VISUAL_HMR_STEPS: VisualHmrStep[] = [
  {
    name: 'bg-red',
    marker: 'DEMO-VISUAL-HMR-BG-RED',
    classLiteral: 'bg-[#ef4444] text-[#ffffff] text-[32rpx] px-[24rpx] py-[16rpx]',
    expectedBackgroundColor: 'rgb(239, 68, 68)',
  },
  {
    name: 'bg-emerald',
    marker: 'DEMO-VISUAL-HMR-BG-EMERALD',
    classLiteral: 'bg-[#10b981] text-[#052e16] text-[32rpx] px-[24rpx] py-[16rpx]',
    expectedBackgroundColor: 'rgb(16, 185, 129)',
  },
  {
    name: 'bg-sky',
    marker: 'DEMO-VISUAL-HMR-BG-SKY',
    classLiteral: 'bg-[#0ea5e9] text-[#082f49] text-[32rpx] px-[24rpx] py-[16rpx]',
    expectedBackgroundColor: 'rgb(14, 165, 233)',
  },
]

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function joinUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, baseUrl).toString()
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`)
  }
  return await response.text()
}

async function waitFor<T>(
  label: string,
  task: () => Promise<T | undefined>,
) {
  const startedAt = Date.now()
  let lastError = ''
  while (Date.now() - startedAt < hmrTimeoutMs) {
    try {
      const value = await task()
      if (value != null) {
        return value
      }
      lastError = 'predicate returned empty'
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await wait(pollIntervalMs)
  }
  throw new Error(`${label} 超时：${lastError}`)
}

async function mutateFile(
  sourceFile: string,
  mutate: (source: string) => string,
) {
  const original = await fs.readFile(sourceFile, 'utf8')
  const next = mutate(original)
  if (next === original) {
    throw new Error(`HMR 源码替换没有产生变化：${sourceFile}`)
  }
  await writeFilePreserveEol(sourceFile, next, original)
  return async () => {
    await writeFilePreserveEol(sourceFile, original, original)
  }
}

async function readTextIfExists(file: string) {
  return await fs.readFile(file, 'utf8').catch(() => '')
}

function createMiniProgramVisualSnippet(sourceFile: string, step: VisualHmrStep) {
  const classLiteral = step.classLiteral
  if (/\.(?:tsx|jsx)$/.test(sourceFile)) {
    return {
      classLiteral,
      snippet: `<View className="${classLiteral}">${step.marker}</View>`,
      anchors: ['<View className=\'index\'>', '<View className="index">', '<View>', '<>'],
    }
  }
  return {
    classLiteral,
    snippet: `<view class="${classLiteral}">${step.marker}</view>`,
    anchors: [
      '<view class="space-y-2.5">',
      '<view class="index">',
      '<view class="p-4">',
      '<view class="content">',
      '<view class="flex flex-col items-center py-4">',
      '<view class="flex flex-col">',
      '<view class="bg-[#123456]">',
      '<view class="bg-[#e90505] text-purple-600 tw-root">',
      '<view>',
    ],
  }
}

function insertMiniProgramVisualSnippet(source: string, sourceFile: string, step: VisualHmrStep) {
  const visual = createMiniProgramVisualSnippet(sourceFile, step)
  const cleaned = removeMiniProgramVisualSnippets(source)
  const anchor = visual.anchors.find(item => cleaned.includes(item))
  if (!anchor) {
    throw new Error(`找不到小程序可视 HMR 插入锚点：${sourceFile}`)
  }
  const index = cleaned.indexOf(anchor) + anchor.length
  return {
    classLiteral: visual.classLiteral,
    source: `${cleaned.slice(0, index)}\n${visual.snippet}${cleaned.slice(index)}`,
  }
}

function removeMiniProgramVisualSnippets(source: string) {
  return source
    .replace(/\n[ \t]*<view class="[^"]*">DEMO-VISUAL-HMR-BG-[^<]+<\/view>/g, '')
    .replace(/\n[ \t]*<View className="[^"]*">DEMO-VISUAL-HMR-BG-[^<]+<\/View>/g, '')
    .replace(/\n[ \t]*<view class="[^"]*">tw-visual-weapp-[^<]+<\/view>/g, '')
    .replace(/\n[ \t]*<View className="[^"]*">tw-visual-weapp-[^<]+<\/View>/g, '')
}

async function insertHBuilderXWebMarker(projectRoot: string, sourceFile: string, item: WebCase, stepIndex: number) {
  const anchors = item.markerAnchorCandidates?.length ? item.markerAnchorCandidates : [item.markerAnchor]
  const restore = await createHmrSourceRestore([
    sourceFile,
    ...item.hmrSteps.flatMap(step => step.sourceMutation ? [path.resolve(projectRoot, step.sourceMutation.file)] : []),
  ])
  const mutation = item.hmrSteps[stepIndex]?.sourceMutation
  const sameFileReplace = mutation?.replace && sameSourceFile(projectRoot, mutation.file, sourceFile)
  const writeSource = async (file: string, source: string) => {
    await writeFilePreserveEol(file, source, await fs.readFile(file, 'utf8'))
  }
  try {
    if (mutation && !sameFileReplace) {
      await appendHmrSourceMutation(projectRoot, mutation, writeSource)
    }
    await rewriteHmrMarker(sourceFile, anchors, item.hmrSteps, stepIndex, sameFileReplace ? mutation?.replace : undefined, writeSource)
    return restore
  }
  catch (error) {
    await restore()
    throw error
  }
}

async function waitForVisualHmrDomMarker(
  page: Page,
  selector: string,
  expectedText: string,
  expectedBackgroundColor: string,
  label: string,
) {
  return await waitFor(label, async () => {
    const locator = page.locator(selector)
    const count = await locator.count()
    if (count === 0) {
      return undefined
    }
    const actual = await locator.first().evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
        color: style.color.replace(/\s+/g, ' '),
        text: element.textContent?.trim() ?? '',
      }
    })
    if (actual.text.includes(expectedText) && actual.backgroundColor === expectedBackgroundColor) {
      return actual
    }
    return undefined
  })
}

function createVisualHmrElement(options: {
  classLiteral: string
  marker: string
  target: 'react' | 'vue' | 'web-react' | 'web-vue'
}) {
  if (options.target === 'react') {
    return `<View data-demo-visual-hmr="${options.marker}" className="${options.classLiteral}">${options.marker}</View>`
  }
  if (options.target === 'web-react') {
    return `<div data-demo-visual-hmr="${options.marker}" className="${options.classLiteral}">${options.marker}</div>`
  }
  if (options.target === 'web-vue') {
    return `<div data-demo-visual-hmr="${options.marker}" class="${options.classLiteral}">${options.marker}</div>`
  }
  return `<view data-demo-visual-hmr="${options.marker}" class="${options.classLiteral}">${options.marker}</view>`
}

function removeH5VisualHmrElements(source: string) {
  return source
    .replace(/\n[ \t]*<View data-demo-visual-hmr="[^"]+" className="[^"]+">DEMO-VISUAL-HMR-BG-[^<]+<\/View>/g, '')
    .replace(/\n[ \t]*<view data-demo-visual-hmr="[^"]+" class="[^"]+">DEMO-VISUAL-HMR-BG-[^<]+<\/view>/g, '')
    .replace(/\n[ \t]*<div data-demo-visual-hmr="[^"]+" className="[^"]+">DEMO-VISUAL-HMR-BG-[^<]+<\/div>/g, '')
    .replace(/\n[ \t]*<div data-demo-visual-hmr="[^"]+" class="[^"]+">DEMO-VISUAL-HMR-BG-[^<]+<\/div>/g, '')
}

function insertH5VisualHmrElement(source: string, anchors: string[], insertion: string, name: string, sourceFile: string) {
  const cleaned = removeH5VisualHmrElements(source)
  const anchor = anchors.find(candidate => cleaned.includes(candidate))
  if (!anchor) {
    throw new Error(`${name} 找不到 visual HMR 插入锚点：${sourceFile}`)
  }
  if (anchor.startsWith('</')) {
    return cleaned.replace(anchor, `${insertion}\n${anchor}`)
  }
  return cleaned.replace(anchor, `${insertion}\n${anchor}`)
}

async function waitForVisualHmrStep(page: Page, step: VisualHmrStep, label: string) {
  return await waitForVisualHmrDomMarker(
    page,
    `[data-demo-visual-hmr="${step.marker}"]`,
    step.marker,
    step.expectedBackgroundColor,
    label,
  )
}

async function reloadForScreenshot(page: Page, url: string) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: Math.min(hmrTimeoutMs, 60_000),
  })
  await page.waitForFunction(() => document.readyState !== 'loading', undefined, { timeout: 30_000 })
}

async function collectRuntimePageEvidence(page: Page) {
  return await page.evaluate(() => {
    const pick = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) {
        return null
      }
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
        className: element.getAttribute('class') ?? '',
        color: style.color.replace(/\s+/g, ' '),
        display: style.display,
        rect: {
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        },
        selector,
        text: element.textContent?.trim().slice(0, 160) ?? '',
      }
    }
    return {
      bodyText: document.body?.textContent?.trim().slice(0, 320) ?? '',
      readyState: document.readyState,
      samples: ['body', '#app', 'uni-page-body', '.content', '.test']
        .map(pick)
        .filter(Boolean),
      url: location.href,
    }
  })
}

async function waitForRuntimeAssertions(page: Page, assertions: WebRuntimeStyleAssertion[] | undefined, label: string) {
  if (!assertions?.length) {
    return undefined
  }
  let latestEvidence: Record<string, unknown> | undefined
  try {
    return await waitFor(label, async () => {
      const evidence: Record<string, unknown> = {}
      for (const assertion of assertions) {
        const count = await page.locator(assertion.selector).count()
        if (count === 0) {
          latestEvidence = {
            ...evidence,
            [assertion.selector]: { missing: true },
          }
          return undefined
        }
        const actual = await readRuntimeStyles(page, assertion)
        evidence[assertion.selector] = actual
        latestEvidence = evidence
        if (!actual || !matchRuntimeStyles(actual, assertion)) {
          return undefined
        }
      }
      return evidence
    })
  }
  catch (error) {
    const pageEvidence = await collectRuntimePageEvidence(page).catch(() => undefined)
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nlatest=${JSON.stringify(latestEvidence)}\npage=${JSON.stringify(pageEvidence)}`)
  }
}

async function waitForCssIncludes(url: string, expected: Array<string | RegExp>, label: string) {
  let missing = expected
  try {
    return await waitFor(label, async () => {
      const css = await fetchText(url)
      missing = expected.filter(item => typeof item === 'string' ? !css.includes(item) : !item.test(css))
      if (missing.length === 0) {
        return { cssPath: url, matched: expected.map(String) }
      }
      return undefined
    })
  }
  catch (error) {
    throw new Error(`${label}: CSS=${url}, missing=${missing.map(String).join(', ')}`, { cause: error })
  }
}

function createHBuilderXWebHmrVisualConfig(item: WebCase): H5HmrVisualConfig {
  return {
    label: `${item.name} HBuilderX Web visual HMR`,
    // 共享用例中的 rpx 尺寸按 375px 基准视口断言。
    viewport: { width: 375, height: 844 },
    steps: item.hmrSteps.map((_, index) => `hbuilderx-step-${index + 1}`),
    async waitForReady(page, url) {
      const cssEvidence = await waitForCssIncludes(
        joinUrl(url, item.initialCssPath),
        item.initialCssContains,
        `${item.name} HBuilderX Web initial CSS`,
      )
      const runtimeEvidence = await waitForRuntimeAssertions(page, item.initialRuntimeStyles, `${item.name} HBuilderX Web initial runtime`)
      return { css: cssEvidence, runtime: runtimeEvidence }
    },
    async mutate(projectRoot, stepIndex) {
      const sourceFile = path.resolve(projectRoot, item.sourceFile)
      return await insertHBuilderXWebMarker(projectRoot, sourceFile, item, stepIndex)
    },
    async waitForUpdate(page, url, _logs, stepIndex) {
      const step = item.hmrSteps[Math.min(stepIndex, item.hmrSteps.length - 1)]!
      const cssEvidence = await waitForCssIncludes(
        joinUrl(url, item.hmrCssPath),
        [...(step.sourceMutation?.cssContains ?? []), ...step.cssContains],
        `${item.name} HBuilderX Web CSS HMR`,
      )
      const assertions = [...(item.persistentRuntimeStyles ?? []), ...(step.runtimeStyles ?? [])]
      const runtimeEvidence = await waitForRuntimeAssertions(page, assertions, `${item.name} HBuilderX Web runtime HMR`)
      await reloadForScreenshot(page, url)
      await page.locator(`text=${step.markerText}`).first().waitFor({ timeout: 30_000 })
      await waitForRuntimeAssertions(page, assertions, `${item.name} HBuilderX Web runtime reload`)
      // 内部 scroll-view 会裁剪 fullPage 截图，先将本轮探针滚入实际可见区域。
      const marker = page.locator('.hbuilderx-web-hmr-probe').first()
      await marker.scrollIntoViewIfNeeded()
      const markerViewport = await marker.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: innerWidth, height: innerHeight }
      })
      if (markerViewport.bottom <= 0 || markerViewport.top >= markerViewport.height || markerViewport.right <= 0 || markerViewport.left >= markerViewport.width) {
        throw new Error(`${item.name} HMR 截图探针仍不在视口内: ${JSON.stringify(markerViewport)}`)
      }
      return {
        classLiteral: step.markerClass,
        css: cssEvidence,
        expectedBackgroundColor: String(step.runtimeStyles?.[0]?.styles.backgroundColor ?? ''),
        runtime: runtimeEvidence,
        markerViewport,
        text: step.markerText,
      }
    },
  }
}

export function createTaroHmrVisualConfig(item: TaroWebHmrCase): H5HmrVisualConfig {
  const isReact = /\.tsx$/.test(item.sourceFile)
  const target = isReact ? 'react' : 'vue'
  return {
    label: item.name,
    steps: VISUAL_HMR_STEPS.map(step => step.name),
    async mutate(projectRoot, stepIndex) {
      const sourceFile = path.resolve(projectRoot, item.sourceFile)
      const step = VISUAL_HMR_STEPS[stepIndex]!
      const insertion = createVisualHmrElement({
        classLiteral: step.classLiteral,
        marker: step.marker,
        target,
      })
      return await mutateFile(sourceFile, (source) => {
        return insertH5VisualHmrElement(source, item.anchors, insertion, item.name, sourceFile)
      })
    },
    async waitForUpdate(page, url, _logs, stepIndex) {
      const step = VISUAL_HMR_STEPS[stepIndex]!
      if (item.assertion === 'css') {
        const cssPaths = item.cssPaths ?? []
        const cssEvidence = await waitFor(`${item.name} Taro H5 CSS HMR`, async () => {
          for (const cssPath of cssPaths) {
            const latest = await fetchText(joinUrl(url, cssPath))
            const bgClass = step.classLiteral.split(/\s+/).find(item => item.startsWith('bg-['))
            if (bgClass && latest.includes(bgClass.replace('bg-[', 'bg-_b_').replace('#', 'h').replace(']', '_B'))) {
              return { cssPath, matched: bgClass }
            }
            if (latest.toLowerCase().includes(step.classLiteral.match(/bg-\[#([0-9a-f]+)\]/i)?.[1] ?? '')) {
              return { cssPath, matched: step.classLiteral }
            }
          }
          return undefined
        })
        await reloadForScreenshot(page, url)
        const runtime = await waitForVisualHmrStep(page, step, `${item.name} Taro H5 DOM visual HMR`)
        return {
          classLiteral: step.classLiteral,
          css: cssEvidence,
          expectedBackgroundColor: step.expectedBackgroundColor,
          runtime,
        }
      }
      const runtime = await waitForVisualHmrStep(page, step, `${item.name} Taro H5 DOM visual HMR`)
      return {
        classLiteral: step.classLiteral,
        expectedBackgroundColor: step.expectedBackgroundColor,
        runtime,
      }
    },
  }
}

export function createWebViteHmrVisualConfig(item: WebViteHmrCase): H5HmrVisualConfig {
  const target = item.sourceFile.endsWith('.tsx') ? 'web-react' : 'web-vue'
  return {
    label: item.name,
    steps: VISUAL_HMR_STEPS.map(step => step.name),
    async mutate(projectRoot, stepIndex) {
      const sourceFile = path.resolve(projectRoot, item.sourceFile)
      const step = VISUAL_HMR_STEPS[stepIndex]!
      const insertion = createVisualHmrElement({
        classLiteral: step.classLiteral,
        marker: step.marker,
        target,
      })
      return await mutateFile(sourceFile, source => insertH5VisualHmrElement(source, [item.classFrom], insertion, item.name, sourceFile))
    },
    async waitForUpdate(page, _url, _logs, stepIndex) {
      const step = VISUAL_HMR_STEPS[stepIndex]!
      const runtime = await waitForVisualHmrStep(page, step, `${item.name} Web Vite visual HMR`)
      return {
        classLiteral: step.classLiteral,
        expectedBackgroundColor: step.expectedBackgroundColor,
        runtime,
      }
    },
  }
}

export function createUniH5HmrVisualConfig(repoRoot: string, name: string): H5HmrVisualConfig | undefined {
  const hbuilderxWebCase = webCases.find(item => item.name === name)
  if (hbuilderxWebCase) {
    return createHBuilderXWebHmrVisualConfig(hbuilderxWebCase)
  }
  const watchCase = buildCases(repoRoot, { includeLocalOnly: true }).find(item => item.name === name)
  const sequence = watchCase?.webHmr?.sourceDomReplacementSequence?.[0]
  if (!watchCase) {
    return undefined
  }
  if (!watchCase.webHmr || !sequence) {
    return {
      label: `${watchCase.label} template visual HMR`,
      steps: VISUAL_HMR_STEPS.map(step => step.name),
      async mutate(_projectRoot, stepIndex) {
        const step = VISUAL_HMR_STEPS[stepIndex]!
        return await mutateFile(watchCase.templateMutation.sourceFile, (source) => {
          if (source.includes('写法示例Start!')) {
            return source
              .replace(/class="[^"]*font-bold[^"]*"|class="text-xl text-gray-600\/95"/, `class="${step.classLiteral}" data-demo-visual-hmr="${step.marker}"`)
              .replace(/DEMO-VISUAL-HMR-BG-[A-Z]+|写法示例Start!/, step.marker)
          }
          return watchCase.templateMutation.mutate(source, {
            classLiteral: step.classLiteral,
            classVariableName: '__twVisualHmrClass',
            marker: step.marker,
          })
        })
      },
      async waitForUpdate(page, _url, _logs, stepIndex) {
        const step = VISUAL_HMR_STEPS[stepIndex]!
        return await waitFor(`${watchCase.label} H5 template HMR`, async () => {
          const actual = await page.evaluate((expectedMarker) => {
            const elements = Array.from(document.querySelectorAll('body *'))
            const element = elements.find(item => item.textContent?.includes(expectedMarker))
            if (!element) {
              return undefined
            }
            const style = window.getComputedStyle(element)
            return {
              backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
              text: element.textContent?.trim() ?? '',
            }
          }, step.marker)
          if (actual?.text.includes(step.marker) && actual.backgroundColor === step.expectedBackgroundColor) {
            return {
              ...actual,
              classLiteral: step.classLiteral,
              expectedBackgroundColor: step.expectedBackgroundColor,
            }
          }
          return undefined
        })
      },
    }
  }
  return {
    label: `${watchCase.label} visual HMR`,
    steps: VISUAL_HMR_STEPS.map(step => step.name),
    async waitForReady(page) {
      const readySelector = watchCase.webHmr?.readySelector
      if (!readySelector) {
        return undefined
      }
      return await waitFor(`${watchCase.label} H5 initial ready`, async () => {
        const count = await page.locator(readySelector).count()
        return count > 0 ? { readySelector } : undefined
      })
    },
    async mutate(_projectRoot, stepIndex) {
      const step = VISUAL_HMR_STEPS[stepIndex]!
      return await mutateFile(watchCase.webHmr!.sourceFile, (source) => {
        const target = /\.(?:tsx|jsx)$/.test(watchCase.webHmr!.sourceFile) ? 'react' : 'vue'
        const insertion = createVisualHmrElement({
          classLiteral: step.classLiteral,
          marker: step.marker,
          target,
        })
        return insertH5VisualHmrElement(
          source,
          [
            '<view>',
            '<View>',
            '</template>',
            '</View>',
          ],
          insertion,
          watchCase.label,
          watchCase.webHmr!.sourceFile,
        )
      })
    },
    async waitForUpdate(page, _url, _logs, stepIndex) {
      const step = VISUAL_HMR_STEPS[stepIndex]!
      const runtime = await waitForVisualHmrStep(page, step, `${watchCase.label} H5 visual DOM HMR`)
      return {
        classLiteral: step.classLiteral,
        expectedBackgroundColor: step.expectedBackgroundColor,
        runtime,
      }
    },
  }
}

export function createMiniProgramHmrVisualConfig(repoRoot: string, name: string): MiniProgramHmrVisualConfig | undefined {
  const watchCase = buildCases(repoRoot, { includeLocalOnly: true }).find(item => item.name === name)
  if (!watchCase) {
    return undefined
  }
  const mutation = watchCase.templateMutation
  return {
    label: `${watchCase.label} mini-program template visual HMR`,
    watchCase,
    steps: VISUAL_HMR_STEPS,
    async mutate(step: VisualHmrStep, previous?: MiniProgramHmrMutation) {
      const sourceFile = mutation.sourceFile
      const original = removeMiniProgramVisualSnippets(await fs.readFile(sourceFile, 'utf8'))
      const [baselineWxml, baselineJs, baselineGlobalStyle] = await Promise.all([
        readTextIfExists(watchCase.outputWxml),
        readTextIfExists(watchCase.outputJs),
        Promise.all([...watchCase.outputStyleCandidates, ...watchCase.globalStyleCandidates].map(readTextIfExists))
          .then(items => items.join('\n')),
      ])
      if (!previous && (baselineWxml.includes(step.marker) || baselineJs.includes(step.marker) || baselineGlobalStyle.includes(step.marker))) {
        throw new Error(`[${watchCase.label}] 小程序可视 HMR marker 已存在：${step.marker}`)
      }
      const next = insertMiniProgramVisualSnippet(original, sourceFile, step)
      await writeFilePreserveEol(sourceFile, original, original)
      await writeFilePreserveEol(sourceFile, next.source, original)
      return {
        classLiteral: next.classLiteral,
        expectedBackgroundColor: step.expectedBackgroundColor,
        marker: step.marker,
        restore: async () => {
          await writeFilePreserveEol(sourceFile, original, original)
        },
      }
    },
  }
}
