import type { CaseResult, RuntimeContext } from './types.ts'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { compareImages } from './compare.ts'

export function createCrossPlatformComparisons(results: CaseResult[], context: RuntimeContext) {
  const byName = new Map<string, CaseResult[]>()
  for (const result of results) {
    const key = `${result.name}::${result.styleIsolationVariant ?? ''}`
    const list = byName.get(key) ?? []
    list.push(result)
    byName.set(key, list)
  }
  for (const [key, entries] of byName) {
    const h5 = entries.find(item => item.platform === 'h5' && item.screenshot)
    for (const platform of ['weapp', 'app-android', 'app-ios', 'app-harmony'] as const) {
      const target = entries.find(item => item.platform === platform && item.screenshot)
      if (!h5?.screenshot || !target?.screenshot || !imagePairExists(h5.screenshot, target.screenshot)) {
        continue
      }
      const comparisonName = `${key.replace(/[^\w.-]+/g, '-')}-${platform}`
      const compared = compareImages(h5.screenshot, target.screenshot, comparisonName, context)
      const comparison = {
        target: platform,
        ...compared,
      }
      h5.comparison = comparison
      h5.diff = compared.diff
      target.comparison = { ...comparison, target: 'h5' }
      target.diff = compared.diff
      if (compared.withinLimit === false) {
        const message = `${platform} 与 H5 截图差异比例 ${compared.ratio} 超过上限 ${context.maxCrossPlatformDiffRatio}`
        h5.status = 'failed'
        h5.error = [h5.error, message].filter(Boolean).join('\n')
        target.status = 'failed'
        target.error = [target.error, message].filter(Boolean).join('\n')
      }
    }
  }
}

export async function writeReport(results: CaseResult[], context: RuntimeContext) {
  const reportJson = path.join(context.artifactRoot, 'report.json')
  const previousResults = process.env['DEMO_VISUAL_REPORT_RESET'] === '1'
    ? []
    : await readPreviousResults(reportJson)
  results = mergeCaseResults(previousResults, results)
  createHmrComparisons(results, context)
  createCrossPlatformComparisons(results, context)
  const reportMd = path.join(context.artifactRoot, 'report.md')
  await fs.writeFile(reportJson, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
  const summary = countResults(results)
  const comparisons = results.filter(item => item.comparison && item.platform === 'h5')
  const visualRows = results.map((item) => {
    const altPrefix = [item.platform, item.name, item.styleIsolationVariant].filter(Boolean).join('-')
    const screenshot = item.screenshot ? renderImageLink(context, item.screenshot, altPrefix) : ''
    const themeLight = item.themeLightScreenshot ? renderImageLink(context, item.themeLightScreenshot, `${altPrefix}-theme-light`) : ''
    const themeManualDark = item.themeManualDarkScreenshot ? renderImageLink(context, item.themeManualDarkScreenshot, `${altPrefix}-theme-manual-dark`) : ''
    const hmrBefore = item.hmrBeforeScreenshot ? renderImageLink(context, item.hmrBeforeScreenshot, `${altPrefix}-hmr-before`) : ''
    const hmrAfter = item.hmrAfterScreenshot ? renderImageLink(context, item.hmrAfterScreenshot, `${altPrefix}-hmr-after`) : ''
    const hmrSteps = renderHmrStepLinks(context, item)
    const diff = renderDiffLinks(context, item)
    const comparison = renderComparison(item)
    const error = item.error ? item.error.split('\n')[0] : ''
    return `| ${item.name} | ${item.platform} | ${item.styleIsolationVariant ?? ''} | ${item.status} | ${item.updateMode ?? 'hmr'} | ${screenshot} | ${themeLight} | ${themeManualDark} | ${hmrBefore} | ${hmrAfter} | ${hmrSteps} | ${diff} | ${comparison} | ${error} |`
  })
  const rows = results.map((item) => {
    const screenshot = item.screenshot ? `[截图](${path.relative(context.artifactRoot, item.screenshot)})` : ''
    const themeLight = item.themeLightScreenshot ? `[亮色](${path.relative(context.artifactRoot, item.themeLightScreenshot)})` : ''
    const themeManualDark = item.themeManualDarkScreenshot ? `[手动暗色](${path.relative(context.artifactRoot, item.themeManualDarkScreenshot)})` : ''
    const hmrBefore = item.hmrBeforeScreenshot ? `[更新前](${path.relative(context.artifactRoot, item.hmrBeforeScreenshot)})` : ''
    const hmrAfter = item.hmrAfterScreenshot ? `[更新后](${path.relative(context.artifactRoot, item.hmrAfterScreenshot)})` : ''
    const hmrSteps = renderHmrStepTextLinks(context, item)
    const diff = renderDiffTextLinks(context, item)
    const comparison = renderComparison(item)
    const error = item.error ? item.error.split('\n')[0] : ''
    return `| ${item.name} | ${item.platform} | ${item.styleIsolationVariant ?? ''} | ${item.status} | ${item.updateMode ?? 'hmr'} | ${screenshot} | ${themeLight} | ${themeManualDark} | ${hmrBefore} | ${hmrAfter} | ${hmrSteps} | ${diff} | ${comparison} | ${error} |`
  })
  const hmrResults = results.filter(item => item.updateMode !== 'native-reload')
  const reloadResults = results.filter(item => item.updateMode === 'native-reload')
  const hmrPairs = hmrResults.filter(item => item.hmrBeforeScreenshot && item.hmrAfterScreenshot)
  const hmrStepCount = hmrResults.reduce((total, item) => total + (item.hmrSteps?.length ?? 0), 0)
  await fs.writeFile(reportMd, [
    '# Demo Visual E2E Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    ...Object.entries(summary).map(([platform, item]) => {
      return `- ${platform}: ${item.passed} passed, ${item.failed} failed, ${item.skipped} skipped`
    }),
    `- Screenshots: ${results.filter(item => item.screenshot).length}`,
    `- HMR visual pairs: ${hmrPairs.length}`,
    `- HMR visual steps: ${hmrStepCount}`,
    `- Native reload visual steps: ${reloadResults.reduce((total, item) => total + (item.hmrSteps?.length ?? 0), 0)}`,
    `- Cross-platform comparisons: ${comparisons.length}`,
    '',
    '## Visual Matrix',
    '',
    '| Demo | Platform | Variant | Status | Update Mode | Screenshot | Theme Light | Theme Manual Dark | Update Before | Update After | Update Steps | Diff | Comparison | Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...visualRows,
    '',
    '## Link Matrix',
    '',
    '| Demo | Platform | Variant | Status | Update Mode | Screenshot | Theme Light | Theme Manual Dark | Update Before | Update After | Update Steps | Diff | Comparison | Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n'))
}

async function readPreviousResults(reportJson: string) {
  try {
    const report = JSON.parse(await fs.readFile(reportJson, 'utf8')) as { results?: CaseResult[] }
    return Array.isArray(report.results) ? report.results : []
  }
  catch {
    return []
  }
}

export function mergeCaseResults(previous: CaseResult[], current: CaseResult[]) {
  const byKey = new Map<string, CaseResult>()
  for (const item of [...previous, ...current]) {
    const key = [item.name, item.platform, item.styleIsolationVariant ?? ''].join('::')
    byKey.set(key, item)
  }
  return [...byKey.values()].sort((left, right) => {
    return left.name.localeCompare(right.name)
      || left.platform.localeCompare(right.platform)
      || (left.styleIsolationVariant ?? '').localeCompare(right.styleIsolationVariant ?? '')
  })
}

export function createHmrComparisons(results: CaseResult[], context: RuntimeContext) {
  for (const item of results) {
    for (const step of item.hmrSteps ?? []) {
      if (!step.beforeScreenshot || !step.afterScreenshot || !imagePairExists(step.beforeScreenshot, step.afterScreenshot)) {
        continue
      }
      const compared = compareImages(
        step.afterScreenshot,
        step.beforeScreenshot,
        [item.name, item.platform, item.styleIsolationVariant, step.name, 'hmr'].filter(Boolean).join('-'),
        context,
      )
      step.diff = compared.diff
      step.evidence = {
        ...step.evidence,
        hmrVisualDiff: {
          differentPixels: compared.differentPixels,
          ratio: compared.ratio,
        },
      }
      if (item.status === 'passed' && (item.platform === 'h5' || item.platform === 'weapp') && compared.differentPixels === 0) {
        item.status = 'failed'
        item.error = `${step.name} HMR 前后截图没有可见像素差异`
      }
    }
    if (!item.hmrBeforeScreenshot || !item.hmrAfterScreenshot || !imagePairExists(item.hmrBeforeScreenshot, item.hmrAfterScreenshot)) {
      continue
    }
    const compared = compareImages(
      item.hmrAfterScreenshot,
      item.hmrBeforeScreenshot,
      [item.name, item.platform, item.styleIsolationVariant, 'hmr'].filter(Boolean).join('-'),
      context,
    )
    item.hmrDiff = compared.diff
    item.diagnostics = {
      ...item.diagnostics,
      hmrVisualDiff: {
        differentPixels: compared.differentPixels,
        ratio: compared.ratio,
      },
    }
    if (item.status === 'passed' && (item.platform === 'h5' || item.platform === 'weapp') && compared.differentPixels === 0) {
      item.status = 'failed'
      item.error = 'HMR 前后截图没有可见像素差异'
    }
  }
}

function imagePairExists(left: string, right: string) {
  return existsSync(left) && existsSync(right)
}

function countResults(results: CaseResult[]) {
  const createInitial = () => ({
    passed: 0,
    failed: 0,
    skipped: 0,
  })
  const summary: Record<CaseResult['platform'], ReturnType<typeof createInitial>> = {
    'app-android': createInitial(),
    'app-harmony': createInitial(),
    'app-ios': createInitial(),
    'h5': createInitial(),
    'weapp': createInitial(),
  }
  for (const result of results) {
    summary[result.platform][result.status] += 1
  }
  return summary
}

function renderImageLink(context: RuntimeContext, file: string, alt: string) {
  const relative = path.relative(context.artifactRoot, file)
  return `<img src="${relative}" alt="${alt}" width="180" />`
}

function renderDiffLinks(context: RuntimeContext, item: CaseResult) {
  const links = [
    item.hmrDiff ? renderImageLink(context, item.hmrDiff, `hmr-diff-${item.platform}-${item.name}`) : '',
    item.diff ? renderImageLink(context, item.diff, `diff-${item.platform}-${item.name}`) : '',
  ].filter(Boolean)
  return links.join('<br />')
}

function renderHmrStepLinks(context: RuntimeContext, item: CaseResult) {
  return (item.hmrSteps ?? [])
    .map((step) => {
      const before = step.beforeScreenshot ? renderImageLink(context, step.beforeScreenshot, `${item.platform}-${item.name}-${step.name}-before`) : ''
      const after = renderImageLink(context, step.afterScreenshot, `${item.platform}-${item.name}-${step.name}-after`)
      const diff = step.diff ? renderImageLink(context, step.diff, `${item.platform}-${item.name}-${step.name}-diff`) : ''
      return [step.name, before, after, diff].filter(Boolean).join('<br />')
    })
    .join('<hr />')
}

function renderDiffTextLinks(context: RuntimeContext, item: CaseResult) {
  const links = [
    item.hmrDiff ? `[HMR diff](${path.relative(context.artifactRoot, item.hmrDiff)})` : '',
    item.diff ? `[跨端 diff](${path.relative(context.artifactRoot, item.diff)})` : '',
  ].filter(Boolean)
  return links.join('<br />')
}

function renderComparison(item: CaseResult) {
  if (!item.comparison) {
    return ''
  }
  const parts = [`ratio=${item.comparison.ratio}`]
  if (item.comparison.maxRatio !== undefined) {
    parts.push(`max=${item.comparison.maxRatio}`, `withinLimit=${item.comparison.withinLimit}`)
  }
  return parts.join(' ')
}

function renderHmrStepTextLinks(context: RuntimeContext, item: CaseResult) {
  return (item.hmrSteps ?? [])
    .map((step) => {
      const links = [
        step.beforeScreenshot ? `[${step.name} 前](${path.relative(context.artifactRoot, step.beforeScreenshot)})` : '',
        `[${step.name} 后](${path.relative(context.artifactRoot, step.afterScreenshot)})`,
        step.diff ? `[${step.name} diff](${path.relative(context.artifactRoot, step.diff)})` : '',
      ].filter(Boolean)
      return links.join(' ')
    })
    .join('<br />')
}
