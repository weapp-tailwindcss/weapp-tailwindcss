import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createGeoIndexPayload } from './generate-geo-index.mjs'
import { seoLocales } from './seo-locales.mjs'
import { scanSeoQuality, summarizeByType, toCoverageRatio } from './seo-quality-lib.mjs'
import { writeStableJson } from './write-stable-json.mjs'

function parseArgs(argv) {
  const options = {
    output: '',
  }
  for (const arg of argv) {
    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length)
    }
  }
  return options
}

const options = parseArgs(process.argv.slice(2))

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(currentDir, '..')
const outputFile = options.output
  ? path.resolve(process.cwd(), options.output)
  : path.join(websiteRoot, 'static', 'seo-quality-report.json')

export function createSeoQualityPayload(now = new Date().toISOString()) {
  const scans = seoLocales.flatMap(locale => [
    scanSeoQuality(locale.docsRoot, `${locale.id}:docs`),
    scanSeoQuality(locale.blogRoot, `${locale.id}:blog`),
  ])
  const issues = scans.flatMap(scan => scan.issues)
  const issueTypes = summarizeByType(issues)
  const localeCoverage = Object.fromEntries(seoLocales.map((locale) => {
    const localeScans = scans.filter(scan => scan.label.startsWith(`${locale.id}:`))
    const coverage = localeScans.reduce((total, scan) => ({
      total: total.total + scan.coverage.total,
      withTitle: total.withTitle + scan.coverage.withTitle,
      withDescription: total.withDescription + scan.coverage.withDescription,
      withKeywords: total.withKeywords + scan.coverage.withKeywords,
    }), { total: 0, withTitle: 0, withDescription: 0, withKeywords: 0 })
    return [locale.id, toCoverageRatio(coverage)]
  }))
  const geo = Object.fromEntries(seoLocales.map(locale => [locale.id, {
    primary: createGeoIndexPayload(locale.id, 'primary', now).totals.all,
    full: createGeoIndexPayload(locale.id, 'full', now).totals.all,
  }]))
  const routeIssues = seoLocales.flatMap((locale) => {
    const payload = createGeoIndexPayload(locale.id, 'full', now)
    return payload.documents.flatMap((document) => {
      const pathname = new URL(document.canonical).pathname
      const hasCorrectPrefix = locale.id === 'en'
        ? !pathname.startsWith('/en/') && !pathname.startsWith('/zh-cn/')
        : pathname.startsWith('/zh-cn/')
      return hasCorrectPrefix && document.alternates['x-default'] === document.alternates['en-US']
        ? []
        : [{ locale: locale.id, source: document.source, canonical: document.canonical }]
    })
  })

  return {
    version: '1.0.0',
    generatedAt: now,
    totals: {
      files: scans.reduce((total, scan) => total + scan.files.length, 0),
      issues: issues.length,
    },
    coverage: localeCoverage,
    issuesByLocale: Object.fromEntries(seoLocales.map(locale => [
      locale.id,
      issues.filter(issue => issue.scope.startsWith(`${locale.id}:`)).length,
    ])),
    geo,
    routeConsistency: {
      valid: routeIssues.length === 0,
      issues: routeIssues,
    },
    issueTypes,
    issues: issues.slice(0, 200),
  }
}

function main() {
  const payload = createSeoQualityPayload()
  const changed = writeStableJson(outputFile, payload)
  const suffix = changed ? '' : '（内容未变化，跳过写入）'
  console.log(`SEO 质量报告已生成: ${path.relative(websiteRoot, outputFile)} (issues=${payload.totals.issues})${suffix}`)
}

main()
