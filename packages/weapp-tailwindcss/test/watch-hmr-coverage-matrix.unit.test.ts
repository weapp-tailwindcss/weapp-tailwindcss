import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { HOT_UPDATE_CASES_BY_TARGET, HOT_UPDATE_COVERED_PROJECTS } from '../../../e2e/e2eMatrix'
import { getFrameworkIdeCases, getFrameworkIdeExemptCases } from '../../../e2e/frameworkSupportMatrix'
import { shouldRequireIdeLivePageVisibility } from '../../../e2e/frameworkIdeClassHotUpdate'
import { frameworkIdeWatchCaseNames } from '../../../e2e/frameworkIdeHotUpdate'
import { buildCases, demoWatchShardCases, getBaseWatchCaseName } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { buildDemoBaseCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/base'
import { buildDemoExtendedCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/extended'
import { createStyleMutationPayload } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import type {
  ClassMutationConfig,
  WatchCase,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import {
  STYLE_APPLY_UNSUPPORTED_CASES,
  STYLE_FUNCTION_UNSUPPORTED_CASES,
  STYLE_REFERENCE_REQUIRED_CASES,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'

const automatedWatchCases = [
  ...buildDemoBaseCases('/repo'),
  ...buildDemoExtendedCases('/repo'),
]
const ideWatchCases = buildCases('/repo', { includeLocalOnly: true })

const watchCoveredProjects = new Set(automatedWatchCases.map(item => item.project))
const watchCoveredCaseNames = new Set(automatedWatchCases.map(item => item.name))
const defaultWatchCoveredCaseNames = new Set(automatedWatchCases.map(item => item.name).filter(name => !name.includes(':')))
const automatedWatchCasesByName = new Map(automatedWatchCases.map(item => [item.name, item]))
const ideWatchCasesByName = new Map(ideWatchCases.map(item => [item.name, item]))
const repoRoot = join(import.meta.dirname, '../../..')
const workflowRoot = join(repoRoot, '.github/workflows')
const demoPackageProjects = readdirSync(join(repoRoot, 'demo'), { withFileTypes: true })
  .filter(item => item.isDirectory())
  .map(item => item.name)
  .filter(name => existsSync(join(repoRoot, 'demo', name, 'package.json')))
  .map(name => `demo/${name}`)
  .sort()
// HBuilderX 项目依赖本机 IDE 验证，不进入 CI 的通用 watch 回归矩阵。
const localOnlyDemoProjects = new Set([
  'demo/issue-951-taro-vite-react-tailwindcss-v4',
  'demo/style-injector-mpx',
  'demo/style-injector-taro-vite-react',
  'demo/style-injector-taro-webpack-react',
  'demo/style-injector-uni-app',
  'demo/subpackage-taro-webpack-react-tailwindcss-v4',
  'demo/subpackage-uni-app-vite-tailwindcss-v4',
  'demo/uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'demo/uni-app-x-vapor-tailwindcss-v4',
  'demo/uni-app-x-vdom-tailwindcss-v4',
])
function isIssueRegressionDemoProject(project: string) {
  return /^demo\/issue-/.test(project)
}

const automatedWatchDemoPackageProjects = demoPackageProjects
  .filter(project => !isIssueRegressionDemoProject(project))
  .filter(project => !localOnlyDemoProjects.has(project))

function toSlashPath(filePath: string) {
  return filePath.replace(/\\/g, '/')
}

function toRepoPath(filePath: string) {
  return toSlashPath(filePath).replace(/^[A-Z]:(?=\/)/i, '')
}

function expectDemoSourceFile(sourceFile: string, message: string) {
  const normalizedSourceFile = toRepoPath(sourceFile)

  expect(normalizedSourceFile, `${message} should edit demo source files`).toContain('/repo/demo/')
  expect(normalizedSourceFile, `${message} should not edit generated dist files`).not.toContain('/dist/')
}

function expectHasRoundConfig(
  roundConfigs: { name: string }[] | undefined,
  roundName: string,
  message: string,
) {
  expect(
    roundConfigs?.some(item => item.name === roundName),
    message,
  ).toBe(true)
}

const templateCarrierPayload = {
  marker: 'tw-watch-template-carrier',
  classLiteral: 'text-[102.43rpx] font-bold',
  classVariableName: '__twTemplateCarrierClass',
}

function toRealRepoPath(sourceFile: string) {
  return toRepoPath(sourceFile).replace('/repo/', `${toSlashPath(repoRoot)}/`)
}

function readWorkflowMatrixRows(filename: string, jobName: string): Array<Record<string, unknown>> {
  const workflow = parse(readFileSync(join(workflowRoot, filename), 'utf8')) as {
    jobs: Record<string, {
      strategy?: {
        matrix?: {
          include?: Array<Record<string, unknown>>
        }
      }
    }>
  }
  return workflow.jobs[jobName]?.strategy?.matrix?.include ?? []
}

function getWorkflowWatchCases(filename: string, jobName: string) {
  return readWorkflowMatrixRows(filename, jobName)
    .map(row => row.watch_case)
    .filter((item): item is string => typeof item === 'string')
}

function expandWorkflowWatchCases(watchCases: string[]) {
  const expanded = new Set<string>()
  for (const watchCase of watchCases) {
    const shardCases = demoWatchShardCases[watchCase as keyof typeof demoWatchShardCases]
    if (shardCases) {
      for (const shardCase of shardCases) {
        expanded.add(shardCase)
      }
      continue
    }
    expanded.add(watchCase)
  }
  return expanded
}

function isWatchCaseCoveredByWorkflow(watchCaseName: string, workflowCases: Set<string>) {
  if (workflowCases.has(watchCaseName)) {
    return true
  }
  const baseName = getBaseWatchCaseName(watchCaseName)
  return Boolean(baseName && watchCaseName.endsWith(':weapp') && workflowCases.has(baseName))
}

function expectTemplateCarrierMutation(
  mutation: ClassMutationConfig,
  message: string,
) {
  expectDemoSourceFile(mutation.sourceFile, message)

  const normalizedSourceFile = toRepoPath(mutation.sourceFile)
  const realSourceFile = toRealRepoPath(mutation.sourceFile)
  expect(existsSync(realSourceFile), `${message} template source should exist: ${realSourceFile}`).toBe(true)

  const source = readFileSync(realSourceFile, 'utf8')
  const mutated = mutation.mutate(source, templateCarrierPayload)
  expect(mutated, `${message} template mutation should change source`).not.toBe(source)
  expect(mutated, `${message} template mutation should inject marker`).toContain(templateCarrierPayload.marker)
  expect(mutated, `${message} template mutation should inject continuous rpx arbitrary class`).toContain(templateCarrierPayload.classLiteral)

  if (/\.(?:vue|uvue|mpx)$/.test(normalizedSourceFile)) {
    const markerIndex = mutated.indexOf(templateCarrierPayload.marker)
    const templateStart = mutated.indexOf('<template')
    const templateEnd = mutated.lastIndexOf('</template>')
    expect(templateStart, `${message} should have a template block`).toBeGreaterThanOrEqual(0)
    expect(templateEnd, `${message} should have a closing template block`).toBeGreaterThan(templateStart)
    expect(markerIndex, `${message} main-style guard should be injected into the template block`).toBeGreaterThan(templateStart)
    expect(markerIndex, `${message} main-style guard should stay inside the template block`).toBeLessThan(templateEnd)

    const scriptStart = mutated.indexOf('<script')
    const scriptEnd = mutated.lastIndexOf('</script>')
    if (scriptStart !== -1 && scriptEnd !== -1) {
      expect(
        markerIndex > scriptStart && markerIndex < scriptEnd,
        `${message} main-style guard should not be injected into script`,
      ).toBe(false)
    }
  }
  else if (/\.wxml$/.test(normalizedSourceFile)) {
    expect(mutated, `${message} wxml template mutation should remain a template edit`).not.toContain('<script')
  }
}

function getWebHmrCases() {
  return automatedWatchCases.filter(watchCase => watchCase.webHmr && !watchCase.name.includes(':'))
}

function collectTemplateCarrierExtension(
  extensions: Set<string>,
  mutation: ClassMutationConfig,
) {
  const extension = toRepoPath(mutation.sourceFile).match(/\.(vue|uvue|wxml|mpx)$/)?.[1]
  if (extension) {
    extensions.add(extension)
  }
}

describe('watch-hmr coverage matrix', () => {
  it('keeps local-only HBuilderX demo projects explicit', () => {
    for (const project of localOnlyDemoProjects) {
      expect(demoPackageProjects, `${project} should remain a real demo package`).toContain(project)
      expect(watchCoveredProjects.has(project), `${project} should stay out of CI watch regression cases`).toBe(false)
    }
  })

  it('keeps issue regression demo projects out of the general watch matrix', () => {
    const issueRegressionProjects = demoPackageProjects.filter(isIssueRegressionDemoProject)

    expect(issueRegressionProjects.length).toBeGreaterThan(0)
    for (const project of issueRegressionProjects) {
      expect(watchCoveredProjects.has(project), `${project} should use a dedicated regression instead of the general watch matrix`).toBe(false)
    }
  })

  it('covers every automated demo package project through watch regression cases', () => {
    for (const project of automatedWatchDemoPackageProjects) {
      expect(
        watchCoveredProjects.has(project),
        `${project} should be covered by watch regression cases`,
      ).toBe(true)
    }
  })

  it('wires every demo watch case into hot-update e2e entries', () => {
    expect([...HOT_UPDATE_CASES_BY_TARGET.demo].sort()).toEqual([...defaultWatchCoveredCaseNames].sort())

    for (const watchCase of automatedWatchCases) {
      const baseCaseName = getBaseWatchCaseName(watchCase.name) ?? watchCase.name
      expect(
        HOT_UPDATE_COVERED_PROJECTS.has(baseCaseName),
        `${watchCase.name} should be included in hot-update e2e coverage`,
      ).toBe(true)
      expect(
        existsSync(join(repoRoot, 'e2e/watch/hot-update/demo', `${baseCaseName}.test.ts`)),
        `${watchCase.name} should have a dedicated e2e watch hot-update test entry`,
      ).toBe(true)
    }
  })

  it('keeps every automated watch case covering developer-facing HMR surfaces', () => {
    expect(automatedWatchCases.length).toBeGreaterThan(0)

    for (const watchCase of automatedWatchCases) {
      expect(watchCase.templateMutation, `${watchCase.project} should cover template class HMR`).toBeDefined()
      expect(watchCase.scriptMutation, `${watchCase.project} should cover script class HMR`).toBeDefined()
      expect(watchCase.styleMutation, `${watchCase.project} should cover style @apply HMR`).toBeDefined()
      expect(watchCase.subPackageMutations?.map(item => item.root).sort(), `${watchCase.project} should cover normal and independent subpackage HMR`).toEqual(['sub-independent', 'sub-normal'])
      expect(watchCase.templateMutation.verifyEscapedIn.length + (watchCase.templateMutation.verifyClassLiteralIn?.length ?? 0)).toBeGreaterThan(0)
      expect(watchCase.scriptMutation.verifyEscapedIn.length + (watchCase.scriptMutation.verifyClassLiteralIn?.length ?? 0)).toBeGreaterThan(0)
      for (const subPackageMutation of watchCase.subPackageMutations ?? []) {
        expect(subPackageMutation.outputWxml).toContain(subPackageMutation.root)
        expect(subPackageMutation.outputJs).toContain(subPackageMutation.root)
        expect(subPackageMutation.templateMutation.sourceFile).toContain(subPackageMutation.root)
        expectDemoSourceFile(subPackageMutation.styleMutation.sourceFile, `${watchCase.project} ${subPackageMutation.root} style HMR`)
        expect(subPackageMutation.templateMutation.roundConfigs?.length).toBeGreaterThanOrEqual(watchCase.splitSubPackageWatchSessions ? 1 : 3)
        expect(subPackageMutation.templateMutation.verifyEscapedIn.length + (subPackageMutation.templateMutation.verifyClassLiteralIn?.length ?? 0)).toBeGreaterThan(0)
      }
      if (watchCase.contentMutation) {
        const expectedCarrier = watchCase.contentMutation.sourceFile.endsWith('.wxml') ? 'wxml' : 'js'
        expect(watchCase.contentMutation.verifyClassLiteralIn).toContain(expectedCarrier)
      }
    }
  })

  it('keeps every Web/H5 watch case verifying source DOM class HMR in a real browser', () => {
    const webHmrCases = getWebHmrCases()

    expect(webHmrCases.map(item => item.name).sort()).toEqual([
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
    ])

    for (const watchCase of webHmrCases) {
      const sequence = watchCase.webHmr?.sourceDomReplacementSequence ?? []
      expect(sequence.length, `${watchCase.name} should verify source DOM H5 HMR`).toBeGreaterThanOrEqual(1)
      for (const item of sequence) {
        expect(item.expectedText, `${watchCase.name} source DOM HMR should assert rendered text`).toBeTruthy()
        expect(Object.keys(item.expectedStyle ?? {}).length, `${watchCase.name} source DOM HMR should assert computed style`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps Web/H5 source DOM HMR spanning TSX, Vue template, and Vue script class edits', () => {
    const byName = new Map(getWebHmrCases().map(item => [item.name, item]))
    const uniDomLabels = byName.get('uni-app-vite-tailwindcss-v4')?.webHmr?.sourceDomReplacementSequence?.map(item => item.label) ?? []

    expect(byName.get('taro-vite-react-tailwindcss-v4')?.webHmr?.sourceFile).toContain('index.tsx')
    expect(byName.get('taro-webpack-react-tailwindcss-v4')?.webHmr?.sourceFile).toContain('index.tsx')
    expect(byName.get('taro-vite-vue3-tailwindcss-v4')?.webHmr?.sourceFile).toContain('index.vue')
    expect(byName.get('taro-webpack-vue3-tailwindcss-v4')?.webHmr?.sourceFile).toContain('index.vue')
    expect(uniDomLabels).toEqual(expect.arrayContaining([
      'title and color text-[#00f285] to text-[#123456]',
      'vue script className bg-[#0000ff] to bg-[#55cc00]',
    ]))

    const expectedCssIncludes = byName
      .get('uni-app-vite-tailwindcss-v4')
      ?.webHmr
      ?.sourceDomReplacementSequence
      ?.find(item => item.label.includes('className'))
      ?.expectedCssIncludes

    expect(expectedCssIncludes).toContain('.bg-\\[\\#55cc00\\]')
  })

  it('keeps PR e2e-watch covering every CI-stable demo development HMR surface', () => {
    const rows = readWorkflowMatrixRows('e2e-watch.yml', 'pr-quick-gate')
    const rawWatchCases = rows
      .map(row => row.watch_case)
      .filter((item): item is string => typeof item === 'string')
    const workflowCases = expandWorkflowWatchCases(rawWatchCases)
    const missing = [...watchCoveredCaseNames]
      .filter(name => !isWatchCaseCoveredByWorkflow(name, workflowCases))
      .sort()

    const taroProjectCases = [
      'taro-vite-react-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
    ]

    expect(rawWatchCases).toEqual(expect.arrayContaining([
      'demo-core',
      'demo-uni',
      ...taroProjectCases,
      'taro-vite-react-tailwindcss-v4:alipay',
      'taro-vite-react-tailwindcss-v4:tt',
      'taro-vite-vue3-tailwindcss-v4:alipay',
      'taro-vite-vue3-tailwindcss-v4:tt',
      'uni-app-vite-tailwindcss-v4:mp-weixin',
      'uni-app-vite-tailwindcss-v4:mp-alipay',
      'uni-app-vite-tailwindcss-v4:mp-qq',
      'uni-app-vite-tailwindcss-v4:mp-toutiao',
    ]))
    expect(rawWatchCases).not.toEqual(expect.arrayContaining([
      'demo-taro-react',
      'demo-taro-vue3',
    ]))
    for (const watchCase of taroProjectCases) {
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          watch_case: watchCase,
          round_profile: 'mini-program-main',
          watch_mini_program_scope: 'main-package',
        }),
        expect.objectContaining({
          watch_case: watchCase,
          round_profile: 'mini-program-subpackages',
          watch_mini_program_scope: 'subpackages',
        }),
        expect.objectContaining({ watch_case: watchCase, round_profile: 'web-only' }),
      ]))
    }
    expect(missing).toEqual([])
  })

  it('keeps complete demo platform coverage on Linux and Windows while macOS stays WeChat-only', () => {
    const rows = readWorkflowMatrixRows('e2e-watch.yml', 'pr-quick-gate')
    const expectedMacosOmissions = [
      'taro-vite-react-tailwindcss-v4:alipay',
      'taro-vite-react-tailwindcss-v4:tt',
      'taro-vite-vue3-tailwindcss-v4:alipay',
      'taro-vite-vue3-tailwindcss-v4:tt',
      'uni-app-vite-tailwindcss-v4:mp-alipay',
      'uni-app-vite-tailwindcss-v4:mp-qq',
      'uni-app-vite-tailwindcss-v4:mp-toutiao',
    ]

    for (const runnerLabel of ['linux', 'windows']) {
      const workflowCases = expandWorkflowWatchCases(
        rows
          .filter(row => row.runner_label === runnerLabel)
          .map(row => row.watch_case)
          .filter((item): item is string => typeof item === 'string'),
      )
      const missing = [...watchCoveredCaseNames]
        .filter(name => !isWatchCaseCoveredByWorkflow(name, workflowCases))
        .sort()

      expect(missing, `${runnerLabel} should cover every automated demo platform`).toEqual([])
    }

    const macosWorkflowCases = expandWorkflowWatchCases(
      rows
        .filter(row => row.runner_label === 'macos')
        .map(row => row.watch_case)
        .filter((item): item is string => typeof item === 'string'),
    )
    const macosMissing = [...watchCoveredCaseNames]
      .filter(name => !isWatchCaseCoveredByWorkflow(name, macosWorkflowCases))
      .sort()

    expect(macosMissing).toEqual(expectedMacosOmissions.sort())
  })

  it('keeps PR e2e-watch covering every CI-stable Web/H5 browser HMR case', () => {
    const rawWatchCases = getWorkflowWatchCases('e2e-watch.yml', 'pr-quick-gate')
    const workflowCases = expandWorkflowWatchCases(rawWatchCases)
    const missing = getWebHmrCases()
      .map(item => item.name)
      .filter(name => !isWatchCaseCoveredByWorkflow(name, workflowCases))
      .sort()

    expect(missing).toEqual([])
  })

  it('keeps nightly e2e-watch covering the full automated development HMR matrix', () => {
    const workflowCases = expandWorkflowWatchCases(getWorkflowWatchCases('e2e-watch.yml', 'nightly-full-regression'))
    const missing = [...watchCoveredCaseNames]
      .filter(name => !workflowCases.has(name))
      .sort()

    expect(missing).toEqual([])
  })

  it('keeps continuous main-style HMR guards on template carriers', () => {
    const cases: WatchCase[] = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]
    const templateCarrierExtensions = new Set<string>()

    for (const watchCase of cases) {
      collectTemplateCarrierExtension(templateCarrierExtensions, watchCase.templateMutation)
      expectTemplateCarrierMutation(watchCase.templateMutation, `${watchCase.name} main package`)
      const expectedMainPackageRounds = watchCase.name.startsWith('uni-app-vite-tailwindcss-v4')
        ? ['baseline-arbitrary', 'complex-corpus', 'hex-arbitrary', 'named-arbitrary-colors']
        : ['baseline-arbitrary', 'complex-corpus', 'hex-arbitrary']
      expect(watchCase.templateMutation.roundConfigs?.map(item => item.name), watchCase.name).toEqual(expectedMainPackageRounds)

      for (const subPackageMutation of watchCase.subPackageMutations ?? []) {
        collectTemplateCarrierExtension(templateCarrierExtensions, subPackageMutation.templateMutation)
        expectTemplateCarrierMutation(
          subPackageMutation.templateMutation,
          `${watchCase.name}:${subPackageMutation.root}`,
        )
        const expectedSubPackageRounds = watchCase.splitSubPackageWatchSessions
          ? ['baseline-arbitrary']
          : ['baseline-arbitrary', 'complex-corpus', 'hex-arbitrary']
        expect(subPackageMutation.templateMutation.roundConfigs?.map(item => item.name), `${watchCase.name}:${subPackageMutation.root}`).toEqual(expectedSubPackageRounds)
      }
    }

    expect(templateCarrierExtensions, 'continuous template HMR guards should cover Vue SFC, WXML, and MPX carriers').toEqual(
      new Set(['mpx', 'vue', 'wxml']),
    )
  })

  it('keeps IDE hot-update cases backed by complex development-time watch scenarios', () => {
    for (const entry of getFrameworkIdeCases()) {
      const watchCaseName = frameworkIdeWatchCaseNames[entry.name]
      expect(watchCaseName, `${entry.name} should map to a watch-HMR case`).toBeDefined()

      const watchCase = ideWatchCasesByName.get(watchCaseName!)
      expect(watchCase, `${entry.name} should reuse an automated watch-HMR case`).toBeDefined()
      expect(watchCase?.project, `${entry.name} should run against the same demo project as e2e:ide`).toBe(`demo/${entry.name}`)
      expect(watchCase?.templateMutation, `${entry.name} should cover template edits in IDE`).toBeDefined()
      expect(watchCase?.scriptMutation, `${entry.name} should cover script edits in IDE`).toBeDefined()
      expect(watchCase?.globalStyleCandidates.length, `${entry.name} should verify global CSS output for IDE class changes`).toBeGreaterThan(0)

      expectHasRoundConfig(
        watchCase?.templateMutation.roundConfigs,
        'complex-corpus',
        `${entry.name} template IDE HMR should include complex arbitrary variants`,
      )
      expectHasRoundConfig(
        watchCase?.scriptMutation.roundConfigs,
        'complex-corpus',
        `${entry.name} script IDE HMR should include complex arbitrary variants`,
      )
    }
  })

  it('keeps Tailwind CSS v4 IDE demos on the standard tailwindcss import surface', () => {
    for (const entry of getFrameworkIdeCases()) {
      if (entry.tailwindcss !== 'v4') {
        continue
      }

      const watchCaseName = frameworkIdeWatchCaseNames[entry.name]
      const watchCase = ideWatchCasesByName.get(watchCaseName!)
      expect(watchCase, `${entry.name} should map to an automated watch case`).toBeDefined()

      const styleSources = [
        watchCase?.styleMutation.sourceFile,
        ...watchCase?.subPackageMutations?.map(item => item.styleMutation.sourceFile) ?? [],
      ].filter((item): item is string => Boolean(item))

      for (const sourceFile of styleSources) {
        const realSourceFile = toRepoPath(sourceFile).replace('/repo/', `${toSlashPath(repoRoot)}/`)
        expect(existsSync(realSourceFile), `${entry.name} style source should exist: ${realSourceFile}`).toBe(true)
        const source = readFileSync(realSourceFile, 'utf8')

        if (source.includes('@import "tailwindcss"') || source.includes('@import "weapp-tailwindcss"')) {
          expect(source, `${entry.name} should use @import "tailwindcss" in ${realSourceFile}`).toContain('@import "tailwindcss"')
          expect(source, `${entry.name} should not expose @import "weapp-tailwindcss" in ${realSourceFile}`).not.toContain('@import "weapp-tailwindcss"')
        }
      }
    }
  })

  it('keeps Tailwind CSS v4 IDE style HMR aligned with @reference requirements', () => {
    for (const entry of getFrameworkIdeCases()) {
      if (entry.tailwindcss !== 'v4') {
        continue
      }

      const watchCaseName = frameworkIdeWatchCaseNames[entry.name]
      const watchCase = ideWatchCasesByName.get(watchCaseName!)
      expect(watchCase, `${entry.name} should map to an automated watch case`).toBeDefined()

      const payload = createStyleMutationPayload(watchCase!)
      expect(payload.referenceDirective, `${entry.name} should inject Tailwind v4 @reference during style HMR`).toBe('@reference "tailwindcss";')
    }
  })

  it('keeps IDE page-visibility relaxations explicit and narrow', () => {
    const originalRequireLivePageVisibility = process.env.E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY
    process.env.E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY = '1'
    try {
      const relaxedCases = getFrameworkIdeCases()
        .filter(entry => !shouldRequireIdeLivePageVisibility({ name: frameworkIdeWatchCaseNames[entry.name]! }))
        .map(entry => entry.name)

      expect(relaxedCases).toEqual([
        'taro-webpack-react-tailwindcss-v4',
        'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
        'uni-app-x-vdom-tailwindcss-v4',
      ])
    }
    finally {
      if (originalRequireLivePageVisibility == null) {
        delete process.env.E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY
      }
      else {
        process.env.E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY = originalRequireLivePageVisibility
      }
    }
  })

  it('keeps Taro Vue3 IDE exemptions paired with full watch-HMR coverage', () => {
    for (const entry of getFrameworkIdeExemptCases()) {
      expect(entry.framework, `${entry.name} should be an explicit Taro Vue3 IDE exemption`).toBe('taro-vue3')
      expect(entry.ide.reason, `${entry.name} should document the Vue3 probe gap`).toContain('Vue3 Taro demo')

      const watchCase = automatedWatchCasesByName.get(entry.name)
      expect(watchCase, `${entry.name} should still be covered by watch-HMR`).toBeDefined()
      expectHasRoundConfig(
        watchCase?.templateMutation.roundConfigs,
        'complex-corpus',
        `${entry.name} template watch-HMR should include complex arbitrary variants`,
      )
      expectHasRoundConfig(
        watchCase?.scriptMutation.roundConfigs,
        'complex-corpus',
        `${entry.name} script watch-HMR should include complex arbitrary variants`,
      )
    }
  })

  it('models normal user edits for every demo case', () => {
    for (const watchCase of automatedWatchCases) {
      const mutationConfigs = [
        watchCase.templateMutation,
        watchCase.scriptMutation,
        watchCase.styleMutation,
        ...watchCase.subPackageMutations?.flatMap(item => [
          item.templateMutation,
          item.styleMutation,
        ]) ?? [],
      ]

      for (const mutationConfig of mutationConfigs) {
        expectDemoSourceFile(mutationConfig.sourceFile, watchCase.project)
      }

      if (watchCase.contentMutation) {
        const expectedCarrier = watchCase.contentMutation.sourceFile.endsWith('.wxml') ? 'wxml' : 'js'
        expectDemoSourceFile(watchCase.contentMutation.sourceFile, `${watchCase.project} content mutation`)
        expect(watchCase.contentMutation.verifyClassLiteralIn, `${watchCase.project} content mutation should verify source-visible literals`).toContain(expectedCarrier)
      }
    }
  })

  it('keeps demo source boundary checks portable on Windows paths', () => {
    expectDemoSourceFile('D:\\repo\\demo\\gulp-tailwindcss-v4\\src\\pages\\index\\index.wxml', 'windows demo path')

    expect(() => {
      expectDemoSourceFile('D:\\repo\\demo\\gulp-tailwindcss-v4\\dist\\pages\\index\\index.wxml', 'windows dist path')
    }).toThrow()
  })

  it('keeps style @apply and Tailwind function validation policy explicit', () => {
    for (const watchCase of automatedWatchCases) {
      const payload = createStyleMutationPayload(watchCase)
      const baseCaseName = getBaseWatchCaseName(watchCase.name) ?? watchCase.name

      if (STYLE_APPLY_UNSUPPORTED_CASES.has(baseCaseName)) {
        expect(payload.applyUtilities, `${watchCase.name} should skip unsupported @apply validation`).toEqual([])
        expect(payload.expectedApplyDeclarations, `${watchCase.name} should skip unsupported @apply declarations`).toEqual([])
      }
      else {
        expect(payload.applyUtilities.length, `${watchCase.name} should validate @apply utilities`).toBeGreaterThan(0)
        expect(payload.expectedApplyDeclarations.length, `${watchCase.name} should validate expanded @apply declarations`).toBeGreaterThan(0)
      }

      if (STYLE_FUNCTION_UNSUPPORTED_CASES.has(baseCaseName)) {
        expect(payload.functionNeedle, `${watchCase.name} should skip unsupported Tailwind function validation`).toBeUndefined()
        expect(payload.functionDeclarations, `${watchCase.name} should not inject unsupported Tailwind functions`).toEqual([])
        expect(payload.expectedFunctionDeclarations, `${watchCase.name} should not expect unsupported Tailwind function declarations`).toEqual([])
        expect(payload.forbiddenFunctionFragments, `${watchCase.name} should not assert unsupported Tailwind function fragments`).toEqual([])
      }
      else {
        expect(payload.functionNeedle, `${watchCase.name} should validate Tailwind function HMR`).toContain('.tw-watch-style-')
        expect(payload.functionDeclarations.length, `${watchCase.name} should inject Tailwind function declarations`).toBeGreaterThan(0)
        expect(payload.expectedFunctionDeclarations.length, `${watchCase.name} should validate resolved Tailwind function declarations`).toBeGreaterThan(0)
        expect(payload.forbiddenFunctionFragments, `${watchCase.name} should forbid unresolved Tailwind functions`).toContain('theme(')
      }

      if (STYLE_REFERENCE_REQUIRED_CASES.has(baseCaseName)) {
        expect(payload.referenceDirective, `${watchCase.name} should include Tailwind v4 @reference`).toBe('@reference "tailwindcss";')
      }
      else {
        expect(payload.referenceDirective, `${watchCase.name} should not need Tailwind v4 @reference`).toBeUndefined()
      }
    }
  })

  it('keeps the mpx script-only added-class regression guarded by global wxss output', () => {
    const mpxCase = automatedWatchCases.find(item => item.project === 'demo/mpx-tailwindcss-v4')
    const globalStyleCandidates = mpxCase?.globalStyleCandidates.map(item => item.replace(/\\/g, '/')) ?? []

    expect(mpxCase).toBeDefined()
    expect(mpxCase?.scriptMutation.verifyClassLiteralIn).toContain('js')
    expect(globalStyleCandidates.some(item => item.includes('styles/app*.wxss'))).toBe(true)
    expect(globalStyleCandidates.some(item => item.includes('styles/index*.wxss'))).toBe(true)
    expect(mpxCase?.minGlobalStyleEscapedClasses).toBeUndefined()
    expect(mpxCase?.requireInitialCompileSuccess).toBeUndefined()
    expect(mpxCase?.initialMutationDelayMs).toBe(15_000)
  })

  it('keeps Taro Webpack Vue3 v4 style HMR wired through the page css import', () => {
    const watchCase = automatedWatchCases.find(item => item.project === 'demo/taro-webpack-vue3-tailwindcss-v4')

    expect(watchCase).toBeDefined()
    expect(toRepoPath(watchCase?.styleMutation?.sourceFile ?? '')).toBe('/repo/demo/taro-webpack-vue3-tailwindcss-v4/src/pages/index/index.css')
    expect(watchCase?.outputStyleCandidates.map(toRepoPath)).toContain('/repo/demo/taro-webpack-vue3-tailwindcss-v4/dist/app.wxss')
  })

  it('keeps the automated watch matrix explicit', () => {
    expect([...watchCoveredProjects].sort()).toEqual(automatedWatchDemoPackageProjects)
  })
})
