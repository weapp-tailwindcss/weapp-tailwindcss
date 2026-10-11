import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { CANONICAL_TEMPLATE_CASES } from '../e2e/canonicalTemplateMatrix'
import { DEMO_COVERAGE_MATRIX } from '../e2e/demoCoverageMatrix'
import { FRAMEWORK_SUPPORT_CASES } from '../e2e/frameworkSupportMatrix'
import { EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES } from '../e2e/multiplatform-build-output/cases'

type Locale = 'zh-CN' | 'en'

interface SupportRow {
  framework: string
  builder: string
  target: string
  tailwind: string
  build: string
  dev: string
  hmr: string
  advanced: string
  evidence: string
  command: string
  source: string
  reason: string
}

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const outputFiles: Record<Locale, string> = {
  'zh-CN': path.resolve(repositoryRoot, 'website/docs/reference/support-matrix.md'),
  'en': path.resolve(repositoryRoot, 'website/i18n/en/docusaurus-plugin-content-docs/current/reference/support-matrix.md'),
}

function status(value: string | undefined): 'verified' | 'local' | 'exempt' | 'not covered' {
  if (value === 'automated' || value === 'required') {
    return 'verified'
  }
  if (value === 'local') {
    return 'local'
  }
  if (value === 'exempt') {
    return 'exempt'
  }
  return 'not covered'
}

function translateStatus(value: string, locale: Locale) {
  if (locale === 'en') {
    return value
  }
  return {
    'verified': '已验证',
    'local': '本地验证',
    'exempt': '豁免',
    'not covered': '未覆盖',
  }[value as 'verified' | 'local' | 'exempt' | 'not covered'] ?? value
}

function commandForDemo(name: string, command: string) {
  return command || `pnpm e2e --filter ${name}`
}

function builderForBuildCase(projectDir: string, framework: string) {
  if (projectDir.includes('webpack')) {
    return 'webpack5'
  }
  if (projectDir.includes('vite')) {
    return 'vite'
  }
  if (framework === 'gulp') {
    return 'gulp'
  }
  return framework
}

function buildRows(): SupportRow[] {
  const rows: SupportRow[] = []

  for (const item of CANONICAL_TEMPLATE_CASES) {
    rows.push({
      framework: item.framework,
      builder: item.builder,
      target: item.target,
      tailwind: 'v4',
      build: 'verified',
      dev: item.kind === 'web' ? 'verified' : 'not covered',
      hmr: item.kind === 'web' ? 'verified' : 'not covered',
      advanced: 'not covered',
      evidence: 'canonical template smoke',
      command: `E2E_CANONICAL_TEMPLATE_CASE=${item.template} pnpm e2e:canonical-templates`,
      source: `templates/${item.template}`,
      reason: '',
    })
  }

  for (const item of DEMO_COVERAGE_MATRIX) {
    for (const platform of item.platforms) {
      rows.push({
        framework: item.framework,
        builder: item.builder,
        target: platform.platform,
        tailwind: item.tailwindcss,
        build: status(platform.staticCoverage),
        dev: platform.devScript ? status(platform.hmrCoverage) : 'not covered',
        hmr: status(platform.hmrCoverage),
        advanced: 'not covered',
        evidence: platform.evidence,
        command: commandForDemo(item.name, platform.command),
        source: item.packageJson,
        reason: platform.reason ?? '',
      })
    }
  }

  const demoPlatformKeys = new Set(rows.map(row => `${row.source}|${row.target}`))
  for (const item of EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES) {
    const source = `${item.projectDir}/package.json`
    const key = `${source}|${item.platform}`
    if (demoPlatformKeys.has(key)) {
      continue
    }
    rows.push({
      framework: item.framework,
      builder: builderForBuildCase(item.projectDir, item.framework),
      target: item.platform,
      tailwind: 'v4',
      build: item.status === 'ci' ? 'verified' : 'local',
      dev: 'not covered',
      hmr: 'not covered',
      advanced: 'not covered',
      evidence: 'multiplatform build output case',
      command: item.command.join(' '),
      source,
      reason: item.reason ?? '',
    })
    demoPlatformKeys.add(key)
  }

  for (const item of FRAMEWORK_SUPPORT_CASES) {
    rows.push({
      framework: item.framework,
      builder: item.builder,
      target: 'framework contract',
      tailwind: item.tailwindcss,
      build: status(item.ci.tier),
      dev: 'not covered',
      hmr: 'not covered',
      advanced: 'not covered',
      evidence: 'framework support matrix',
      command: `E2E_PROJECT_FILTER=${item.name} pnpm test:frameworks:matrix`,
      source: item.project.projectPath,
      reason: item.ci.reason ?? '',
    })
  }

  return rows.sort((a, b) => `${a.framework}|${a.builder}|${a.target}|${a.source}`.localeCompare(`${b.framework}|${b.builder}|${b.target}|${b.source}`))
}

function cell(value: string) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

const repositoryOnlyCommandRE = /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?(?:--filter|e2e(?::[\w-]+)*|build:docs|build:pkg|build:apps|docs:packages:check|run:watch)\b/i

function displayCommand(command: string, locale: Locale) {
  if (repositoryOnlyCommandRE.test(command)) {
    return locale === 'en' ? 'Automated repository verification' : '仓库自动化验证'
  }
  return command
}

function displayWidth(value: string) {
  let width = 0
  for (const character of value) {
    width += /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(character) ? 2 : 1
  }
  return width
}

function padCell(value: string, width: number) {
  return `${value}${' '.repeat(Math.max(0, width - displayWidth(value)))}`
}

function translateReason(reason: string, locale: Locale) {
  if (locale === 'zh-CN' || !reason) {
    return reason
  }
  if (/HBuilderX/u.test(reason)) {
    return 'HBuilderX and platform SDKs are local-only and excluded from the default CI matrix.'
  }
  if (/style-injector/u.test(reason)) {
    return 'This checks style-injector output and is outside the Tailwind source HMR path.'
  }
  if (/subpackage/u.test(reason)) {
    return 'The dedicated subpackage case verifies build isolation and is outside the default IDE/HMR matrix.'
  }
  if (/RN|Android|iOS/u.test(reason)) {
    return 'This target depends on local native SDKs or simulators and is excluded from default CI.'
  }
  if (/Taro|dev 脚本|watch-HMR/u.test(reason)) {
    return 'A development script exists, but stable watch-HMR assertions are not part of default CI.'
  }
  if (/Mpx|gulp/u.test(reason)) {
    return 'Only the default development target is covered in CI; other modes use dedicated build cases.'
  }
  return 'This capability is local-only or exempt from the default CI matrix.'
}

function render(locale: Locale) {
  const english = locale === 'en'
  const rows = buildRows()
  const intro = [
    '---',
    `title: ${english ? 'Support Matrix' : '支持矩阵'}`,
    `description: ${english ? 'Verified build, development, HMR, and platform coverage for weapp-tailwindcss.' : 'weapp-tailwindcss 的构建、开发、HMR 与多平台验证覆盖。'}`,
    `keywords: [${english ? 'support matrix, Vite, uni-app, Taro, weapp-vite, Tailwind CSS, HMR, build coverage' : '支持矩阵, Vite, uni-app, Taro, weapp-vite, Tailwind CSS, HMR, 构建覆盖'}]`,
    '---',
    '',
    `# ${english ? 'Support Matrix' : '支持矩阵'}`,
    '',
    `> ${english ? 'This file is generated from the repository E2E and template matrices. Do not edit it manually.' : '此文件由仓库 E2E 与模板矩阵生成，请勿手工编辑。'}`,
    '',
    english
      ? 'Only capabilities backed by executable evidence are marked as verified. `not covered` means the repository has no automated or local evidence for that capability.'
      : '只有存在可执行证据的能力才会标记为“已验证”。“未覆盖”表示仓库没有自动化或本地验证证据。',
    '',
  ]

  const headers = [
    english ? 'Framework' : '框架',
    english ? 'Builder' : '构建器',
    english ? 'Target' : '目标',
    'Tailwind',
    english ? 'Build' : '构建',
    english ? 'Dev' : '开发',
    'HMR',
    'SSR/library/optimize/sourcemap',
    english ? 'Evidence' : '证据',
    english ? 'Command' : '命令',
    english ? 'Source' : '来源',
    english ? 'Reason' : '原因',
  ]
  const tableRows = rows.map(row => [
    cell(row.framework),
    cell(row.builder),
    cell(row.target),
    cell(row.tailwind),
    cell(translateStatus(row.build, locale)),
    cell(translateStatus(row.dev, locale)),
    cell(translateStatus(row.hmr, locale)),
    cell(translateStatus(row.advanced, locale)),
    cell(row.evidence),
    `\`${cell(displayCommand(row.command, locale))}\``,
    `\`${cell(row.source)}\``,
    cell(translateReason(row.reason, locale)),
  ])
  const widths = headers.map((header, index) => Math.max(3, displayWidth(header), ...tableRows.map(row => displayWidth(row[index]))))
  const formatRow = (values: string[]) => `| ${values.map((value, index) => padCell(value, widths[index])).join(' | ')} |`
  intro.push(formatRow(headers), formatRow(widths.map(width => '-'.repeat(width))))
  for (const row of tableRows) {
    intro.push(formatRow(row))
  }
  return `${intro.join('\n')}\n`
}

async function main() {
  const check = process.argv.includes('--check')
  if (!check) {
    await Promise.all(Object.values(outputFiles).map(file => mkdir(path.dirname(file), { recursive: true })))
  }

  for (const locale of Object.keys(outputFiles) as Locale[]) {
    const file = outputFiles[locale]
    const expected = render(locale)
    if (check) {
      let actual = ''
      try {
        actual = await readFile(file, 'utf8')
      }
      catch {
      }
      if (actual !== expected) {
        throw new Error(`${path.relative(repositoryRoot, file)} is out of date; run pnpm support-matrix:generate`)
      }
      continue
    }
    await writeFile(file, expected)
  }
}

await main()
