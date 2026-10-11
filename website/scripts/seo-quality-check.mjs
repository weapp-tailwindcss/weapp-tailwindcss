import process from 'node:process'
import { seoLocales } from './seo-locales.mjs'
import { scanSeoQuality, summarizeByType } from './seo-quality-lib.mjs'

function parseArgs(argv) {
  const options = {
    strict: false,
    maxIssues: 0,
    only: '',
  }
  for (const arg of argv) {
    if (arg === '--strict') {
      options.strict = true
      continue
    }
    if (arg.startsWith('--max-issues=')) {
      options.maxIssues = Number(arg.slice('--max-issues='.length)) || 0
      continue
    }
    if (arg.startsWith('--only=')) {
      options.only = arg.slice('--only='.length).trim()
    }
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
const scans = seoLocales.flatMap(locale => [
  scanSeoQuality(locale.docsRoot, `${locale.id}:docs`),
  scanSeoQuality(locale.blogRoot, `${locale.id}:blog`),
])
const filteredScans = scans.map(scan => ({
  ...scan,
  issues: scan.issues.filter(issue => !options.only || issue.type === options.only),
}))
const issues = filteredScans.flatMap(scan => scan.issues)

const grouped = summarizeByType(issues)

console.table([
  ...filteredScans.map(scan => ({ scope: scan.label, files: scan.files.length, issues: scan.issues.length })),
  { scope: 'all', files: scans.reduce((total, scan) => total + scan.files.length, 0), issues: issues.length },
])

if (Object.keys(grouped).length > 0) {
  console.table(
    Object.entries(grouped).map(([type, count]) => ({
      type,
      count,
    })),
  )
}

if (issues.length > 0) {
  const preview = options.maxIssues > 0 ? issues.slice(0, options.maxIssues) : issues.slice(0, 50)
  for (const issue of preview) {
    console.log(`[${issue.scope}] ${issue.file} - ${issue.type}: ${issue.message}`)
  }
  if (issues.length > preview.length) {
    console.log(`... 其余 ${issues.length - preview.length} 条问题未展示`)
  }
}

if (!options.strict) {
  process.exit(0)
}

if (issues.length === 0) {
  console.log('SEO 质量检查通过。')
  process.exit(0)
}

console.error(`SEO 质量检查失败，共 ${issues.length} 条问题。`)
process.exit(1)
