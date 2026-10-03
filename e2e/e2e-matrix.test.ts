import fs from 'node:fs'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { buildCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { CANONICAL_TEMPLATE_CASES } from './canonicalTemplateMatrix'
import {
  DEMO_COVERAGE_MATRIX,
  discoverDemoPackageNames,
  getAutomatedHotUpdateDemoNames,
  getAutomatedThreeBlockHotUpdateDemoNames,
  getDefaultHotUpdateDemoNames,
} from './demoCoverageMatrix'
import {
  getAllStaticE2EProjectNames,
  HOT_UPDATE_COVERED_PROJECTS,
  HOT_UPDATE_EXEMPT_PROJECTS,
} from './e2eMatrix'
import { frameworkIdeWatchCaseNames } from './frameworkIdeHotUpdate'
import { getFrameworkIdeCases } from './frameworkSupportMatrix'
import { miniProgramCases, uniAppAppCases, uniAppXAppCases, webCases } from './hbuilderx-local/cases'
import { MULTIPLATFORM_BUILD_OUTPUT_CASES } from './multiplatform-build-output/cases'
import { MULTIPLATFORM_TARGETS } from './multiplatform-build-output/targets'
import { E2E_PROJECTS } from './projectEntries'
import {
  createRootStyleImportShellHmrCases,
  ROOT_STYLE_IMPORT_SHELL_HMR_EXEMPTIONS,
} from './rootStyleImportShellHmr'
import { taroWebHmrCaseNames } from './taro-web-demo-hmr-cases'
import { createUniAppCssPostHmrCases } from './uniAppCssPostHmr'
import { webViteHmrCoverageCaseNames } from './web-vite-demo-hmr-cases'

interface DemoPackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

const DEMO_THEME_MODE_REQUIRED_TOKENS = [
  'theme-mode-demo',
  'system-dark:',
  'theme-dark',
]

const DEMO_MANUAL_DARK_TOKENS = {
  v3: ['theme-dark:bg-zinc-950'],
  v4: ['dark:bg-zinc-950', 'dark:bg-[#09090b]'],
} as const
const ICONIFY_REGRESSION_DEPS = [
  '@iconify/tailwind4',
  '@iconify-json/mdi',
  '@iconify-json/svg-spinners',
] as const
const ICONIFY_REGRESSION_SOURCE_TOKENS = [
  'i-[mdi--github-circle]',
  'i-[mdi--star]',
  'i-[svg-spinners--180-ring-with-bg]',
  'before:content-[\'现在，让我们开始神奇的_tailwindcss_开发之旅吧！\']',
  'before:content-[\'现在，让我们继续神奇的_tailwindcss_HMR_回归之旅吧！\']',
] as const
const ISSUE_977_978_DEMO_SOURCE_TOKENS = [
  't-class',
  'bg-[#0977ee]',
  'text-[31rpx]',
  'px-[29rpx]',
  '--test-color',
  '--color-test',
  '--font-test',
  '--font-sans',
  '--font-serif',
  '--font-mono',
  '--color-red-500',
  '--color-blue-500',
  '--color-slate-900',
  '--spacing',
  '--text-base',
  '--font-weight-bold',
  '--radius-lg',
  '--default-font-family',
] as const

function readDemoPackageJson(packageJson: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', packageJson), 'utf8'),
  ) as DemoPackageJson
}

function discoverAllDemoPackageJsonFiles() {
  const demoRoot = path.resolve(__dirname, '../demo')
  const packageJsonFiles: string[] = []
  const visit = (dir: string) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name === 'node_modules' || dirent.name === 'dist' || dirent.name === 'unpackage' || dirent.name === '.output') {
        continue
      }
      const file = path.join(dir, dirent.name)
      if (dirent.isDirectory()) {
        visit(file)
        continue
      }
      if (dirent.name === 'package.json') {
        packageJsonFiles.push(path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/'))
      }
    }
  }
  visit(demoRoot)
  return packageJsonFiles.sort()
}

function collectDemoIconifyCssEntries() {
  const demoRoot = path.resolve(__dirname, '../demo')
  const cssFiles: string[] = []
  const visit = (dir: string) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name === 'node_modules' || dirent.name === 'dist' || dirent.name === 'unpackage' || dirent.name === '.output') {
        continue
      }
      const file = path.join(dir, dirent.name)
      if (dirent.isDirectory()) {
        visit(file)
        continue
      }
      if (!/\.(?:css|scss|less)$/.test(dirent.name)) {
        continue
      }
      const source = fs.readFileSync(file, 'utf8')
      if (source.includes('@plugin "@iconify/tailwind4"') || source.includes('@plugin \'@iconify/tailwind4\'')) {
        cssFiles.push(path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/'))
      }
    }
  }
  visit(demoRoot)
  return cssFiles.sort()
}

function scriptName(value: string) {
  return value.split(/\s+/, 1)[0] ?? value
}

function platformFromScriptName(name: string) {
  if (name === 'build' || name === 'dev') {
    return undefined
  }
  if (name === 'build:babel' || name === 'build:local' || name === 'build:debug-loader') {
    return undefined
  }
  if (name === 'build:e2e' || name === 'test:e2e') {
    return undefined
  }
  if (name === 'dev:debug' || name === 'dev:local' || name === 'dev:debug-loader' || name === 'dev:e2e-watch') {
    return undefined
  }
  if (name === 'dev:write') {
    return undefined
  }
  if (name === 'dev:0' || name === 'dev:1' || name === 'dev:open') {
    return undefined
  }
  if (name === 'build:custom' || name === 'dev:custom') {
    return undefined
  }
  if (name === 'build:weapp' || name === 'dev:weapp') {
    return 'weapp'
  }
  if (name === 'dev:android:emulator') {
    return 'app-android'
  }
  if (name === 'dev:ios:simulator') {
    return 'app-ios'
  }
  if (name.startsWith('build:')) {
    return name.slice('build:'.length)
  }
  if (name.startsWith('dev:')) {
    return name.slice('dev:'.length)
  }
}

function isPlatformCovered(platforms: Set<string>, platform: string) {
  if (platform === 'app') {
    return platforms.has('app') || (platforms.has('app-android') && platforms.has('app-ios'))
  }
  if (platform === 'android' || platform === 'ios') {
    return platforms.has(platform) || platforms.has('rn')
  }
  if (platform === 'harmony') {
    return platforms.has(platform) || platforms.has('harmony-hybrid')
  }
  return platforms.has(platform)
}

function collectDemoWeappTailwindcssConfigFiles() {
  const demoRoot = path.resolve(__dirname, '../demo')
  const files: string[] = []
  const ignoredDirs = new Set(['node_modules', 'dist', '.output', '.vite', '.turbo'])
  const configFileRE = /(?:^|\/)(?:vite\.config|_vite\.config|webpack\.config|rsbuild\.config|nuxt\.config|mpx\.config|gulpfile|config\/index)\.[cm]?[jt]s$/

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          walk(path.join(dir, entry.name))
        }
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const file = path.join(dir, entry.name)
      const relative = path.relative(demoRoot, file).split(path.sep).join('/')
      if (!configFileRE.test(relative)) {
        continue
      }
      const code = fs.readFileSync(file, 'utf8')
      if (code.includes('WeappTailwindcss')) {
        files.push(file)
      }
    }
  }

  walk(demoRoot)
  return files.sort()
}

function readDemoSource(entry: { name: string }) {
  const demoRoot = path.resolve(__dirname, '../demo', entry.name)
  const ignoredDirs = new Set(['node_modules', 'dist', 'unpackage', '.debug', '.vite', '.turbo'])
  const sourceExts = new Set(['.css', '.js', '.jsx', '.mpx', '.scss', '.ts', '.tsx', '.uvue', '.vue', '.wxml'])
  const parts: string[] = []

  function walk(dir: string) {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (!ignoredDirs.has(dirent.name)) {
          walk(path.join(dir, dirent.name))
        }
        continue
      }
      if (!dirent.isFile() || !sourceExts.has(path.extname(dirent.name))) {
        continue
      }
      parts.push(fs.readFileSync(path.join(dir, dirent.name), 'utf8'))
    }
  }

  walk(demoRoot)
  return parts.join('\n')
}

function demoPlatformKey(name: string, platform: string) {
  return `${name}:${platform}`
}

function outputCaseKey(item: { projectDir: string, platform: string }) {
  return demoPlatformKey(item.projectDir.replace('demo/', ''), item.platform)
}

function hasBuildOutputEvidence(name: string, platform: string, cases: Map<string, typeof MULTIPLATFORM_BUILD_OUTPUT_CASES[number]>) {
  const item = cases.get(demoPlatformKey(name, platform))
  return Boolean(item && (item.status === 'ci' || item.styleContains.length > 0 || item.reason))
}

describe('e2e matrix', () => {
  it('keeps every canonical template mapped to a runnable CSS entry', () => {
    for (const item of CANONICAL_TEMPLATE_CASES) {
      const root = path.resolve(__dirname, '..', 'templates', item.template)
      expect(fs.existsSync(path.join(root, 'package.json')), `${item.template} should include package.json`).toBe(true)
      expect(fs.existsSync(path.join(root, item.cssEntry)), `${item.template} should include ${item.cssEntry}`).toBe(true)
      expect(fs.existsSync(path.join(root, 'pnpm-lock.yaml')), `${item.template} should include pnpm-lock.yaml`).toBe(true)
    }
  })

  it('covers every CI-compatible uni-app Vite root import shell demo and platform', () => {
    const cases = createRootStyleImportShellHmrCases('/repo')
    const casesByProject = new Map<string, typeof cases>()
    for (const item of cases) {
      const projectCases = casesByProject.get(item.project) ?? []
      projectCases.push(item)
      casesByProject.set(item.project, projectCases)
    }

    expect([...casesByProject.keys()].sort()).toEqual([
      'subpackage-uni-app-vite-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
    ])
    expect(casesByProject.get('uni-app-vite-tailwindcss-v4')?.map(item => item.platform)).toEqual([
      'mp-weixin',
      'mp-alipay',
      'mp-qq',
      'mp-toutiao',
    ])
    expect(casesByProject.get('subpackage-uni-app-vite-tailwindcss-v4')?.map(item => item.platform)).toEqual([
      'mp-weixin',
      'mp-alipay',
      'mp-toutiao',
    ])
    for (const testCase of casesByProject.get('uni-app-vite-tailwindcss-v4') ?? []) {
      expect(testCase.watchStyleFiles).toEqual([
        `/repo/demo/uni-app-vite-tailwindcss-v4/dist/dev/${testCase.platform}/components/HelloWorld.${testCase.rootStyleFile.split('.').pop()}`,
      ])
    }
    for (const testCase of casesByProject.get('subpackage-uni-app-vite-tailwindcss-v4') ?? []) {
      expect(testCase.watchStyleFiles).toEqual([
        `/repo/demo/subpackage-uni-app-vite-tailwindcss-v4/dist/dev/${testCase.platform}/pages/index/index.${testCase.rootStyleFile.split('.').pop()}`,
      ])
    }
    for (const project of ['uni-app-vite-tailwindcss-v4', 'subpackage-uni-app-vite-tailwindcss-v4']) {
      const entry = DEMO_COVERAGE_MATRIX.find(item => item.name === project)
      for (const testCase of casesByProject.get(project) ?? []) {
        expect(
          entry?.platforms.find(item => item.platform === testCase.platform)?.rootStyleShellHmrCoverage,
          `${testCase.name} should declare root style shell HMR coverage`,
        ).toBe('automated')
      }
    }

    expect(ROOT_STYLE_IMPORT_SHELL_HMR_EXEMPTIONS.map(item => item.project)).toEqual(expect.arrayContaining([
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'issue-uview-plus-cssentries',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
      'uni-app-x-vdom-tailwindcss-v4',
    ]))
  })

  it('covers scoped CSS post HMR for the DCloud Vite issue fixture', () => {
    const cases = createUniAppCssPostHmrCases('/repo')

    expect(cases.map(item => item.name)).toEqual([
      'issue-uview-plus-cssentries:mp-weixin',
      'issue-uview-plus-cssentries:mp-alipay',
    ])
    for (const testCase of cases) {
      expect(testCase.sourceFile).toBe('/repo/demo/issue-uview-plus-cssentries/src/pages/demonstration/index.vue')
      expect(testCase.outputStyleFile).toMatch(/dist\/dev\/mp-(?:weixin|alipay)\/pages\/demonstration\/index\.(?:wxss|acss)$/)
      expect(testCase.generatedStyleFile).toMatch(/dist\/dev\/mp-(?:weixin|alipay)\/styles\/tailwindcss\.(?:wxss|acss)$/)
    }
  })

  it('keeps every demo package explicit in the demo coverage matrix', () => {
    expect(DEMO_COVERAGE_MATRIX.map(item => item.name).sort()).toEqual(discoverDemoPackageNames())
  })

  it('requires every demo package to install the Iconify HMR regression dependencies', () => {
    for (const packageJson of discoverAllDemoPackageJsonFiles()) {
      if (packageJson.startsWith('demo/issue-')) {
        continue
      }
      const pkg = readDemoPackageJson(packageJson)
      const dependencies = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }
      for (const dep of ICONIFY_REGRESSION_DEPS) {
        expect(dependencies[dep], `${packageJson} should install ${dep}`).toBeDefined()
      }
    }
  })

  it('keeps every Iconify Tailwind entry wired to bracket icon and content build fixtures', () => {
    const cssEntries = collectDemoIconifyCssEntries()
    expect(cssEntries.length, 'demo Iconify Tailwind entries should be discovered').toBeGreaterThan(0)
    for (const cssEntry of cssEntries) {
      const entryPath = path.resolve(__dirname, '..', cssEntry)
      const entryName = path.basename(entryPath)
      const siblingSources = fs.readdirSync(path.dirname(entryPath), { withFileTypes: true })
        .filter(item => item.isFile() && /\.(?:css|scss|less)$/.test(item.name))
        .map(item => fs.readFileSync(path.join(path.dirname(entryPath), item.name), 'utf8'))
        .filter(source => source.includes(`@reference "./${entryName}"`) || source.includes(`@reference './${entryName}'`))
      const source = [fs.readFileSync(entryPath, 'utf8'), ...siblingSources].join('\n')
      expect(source, `${cssEntry} should declare @source inline for Iconify build regression`).toContain('@source inline(')
      for (const token of ICONIFY_REGRESSION_SOURCE_TOKENS) {
        expect(source, `${cssEntry} should include ${token}`).toContain(token)
      }
    }
  })

  it('keeps every demo coverage entry backed by package.json and platform evidence', () => {
    for (const entry of DEMO_COVERAGE_MATRIX) {
      expect(entry.packageJson, `${entry.name} should point at its package.json`).toBe(`demo/${entry.name}/package.json`)
      expect(
        fs.existsSync(path.resolve(__dirname, '..', entry.packageJson)),
        `${entry.name} package.json should exist`,
      ).toBe(true)
      const pkg = readDemoPackageJson(entry.packageJson)
      expect(entry.platforms.length, `${entry.name} should declare at least one platform`).toBeGreaterThan(0)
      for (const platform of entry.platforms) {
        expect(platform.buildCommand, `${entry.name} ${platform.platform} should document build command`).toBeTruthy()
        expect(platform.buildEvidence, `${entry.name} ${platform.platform} should document build evidence`).toBeTruthy()
        expect(platform.devCommand, `${entry.name} ${platform.platform} should document dev command`).toBeTruthy()
        expect(platform.devEvidence, `${entry.name} ${platform.platform} should document dev evidence`).toBeTruthy()
        expect(platform.hmrCommand, `${entry.name} ${platform.platform} should document HMR command`).toBeTruthy()
        expect(platform.hmrEvidence, `${entry.name} ${platform.platform} should document HMR evidence`).toBeTruthy()
        if (platform.staticCoverage === 'automated') {
          expect(platform.buildScript, `${entry.name} ${platform.platform} automated build should expose a build script`).toBeTruthy()
        }
        expect(platform.command.length, `${entry.name} ${platform.platform} should document a validation command`).toBeGreaterThan(0)
        expect(platform.evidence.length, `${entry.name} ${platform.platform} should document validation evidence`).toBeGreaterThan(0)
        expect(
          platform.devHmrSnapshotCoverage,
          `${entry.name} ${platform.platform} dev/HMR snapshot coverage should match its HMR execution status`,
        ).toBe(platform.hmrCoverage)
        expect(
          platform.devCoverage,
          `${entry.name} ${platform.platform} should declare normal dev coverage`,
        ).toBeTruthy()
        if (platform.devCoverage === 'exempt') {
          expect(platform.reason?.length, `${entry.name} ${platform.platform} dev exemption should explain why`).toBeGreaterThan(0)
        }
        if (platform.devCoverage !== 'exempt') {
          expect(platform.devScript, `${entry.name} ${platform.platform} covered dev target should expose a dev script`).toBeTruthy()
        }
        if (platform.buildScript) {
          expect(
            pkg.scripts?.[scriptName(platform.buildScript)],
            `${entry.name} ${platform.platform} build script should exist`,
          ).toBeDefined()
        }
        if (platform.devScript) {
          expect(
            pkg.scripts?.[scriptName(platform.devScript)],
            `${entry.name} ${platform.platform} dev script should exist`,
          ).toBeDefined()
        }
        if (platform.staticCoverage !== 'automated' || platform.hmrCoverage !== 'automated') {
          expect(platform.reason?.length, `${entry.name} ${platform.platform} should explain local/exempt coverage`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('keeps every demo wired to system and manual dark mode examples', () => {
    for (const entry of DEMO_COVERAGE_MATRIX) {
      const source = readDemoSource(entry)
      for (const token of DEMO_THEME_MODE_REQUIRED_TOKENS) {
        if (entry.name.startsWith('issue-') || entry.name.startsWith('style-injector-')) {
          continue
        }
        expect(source, `${entry.name} should include ${token}`).toContain(token)
      }
      const manualDarkTokens = DEMO_MANUAL_DARK_TOKENS[entry.tailwindcss]
      if (entry.name.startsWith('issue-') || entry.name.startsWith('style-injector-')) {
        continue
      }
      expect(
        manualDarkTokens.some(token => source.includes(token)),
        `${entry.name} should include one manual dark variant: ${manualDarkTokens.join(', ')}`,
      ).toBe(true)
    }
  })

  it('keeps every Tailwind CSS v4 demo wired to issues 977 and 978 source regressions', () => {
    for (const entry of DEMO_COVERAGE_MATRIX) {
      if (entry.name.startsWith('web/')) {
        continue
      }
      if (entry.name.startsWith('issue-')) {
        continue
      }
      const pkg = readDemoPackageJson(entry.packageJson)
      const dependencies = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }
      if (dependencies.tailwindcss !== 'catalog:tailwindcss4' || !dependencies['weapp-tailwindcss']) {
        continue
      }

      const source = readDemoSource(entry)
      for (const token of ISSUE_977_978_DEMO_SOURCE_TOKENS) {
        expect(source, `${entry.name} should include issue 977/978 regression token ${token}`).toContain(token)
      }
    }
  })

  it('covers every platform-looking demo script in the demo coverage matrix', () => {
    for (const entry of DEMO_COVERAGE_MATRIX) {
      const pkg = readDemoPackageJson(entry.packageJson)
      const platforms = new Set(entry.platforms.map(item => item.platform))
      const missing = Object.keys(pkg.scripts ?? {})
        .map(platformFromScriptName)
        .filter((platform): platform is string => Boolean(platform))
        .filter(platform => !isPlatformCovered(platforms, platform))

      expect([...new Set(missing)].sort(), `${entry.name} should declare every package platform script`).toEqual([])
    }
  })

  it('declares template/script/style block coverage for SFC-like demos', () => {
    for (const entry of DEMO_COVERAGE_MATRIX.filter(item => item.sourceShape.includes('sfc') || item.sourceShape === 'uvue')) {
      expect(entry.sfcBlocks, `${entry.name} should declare template/script/style coverage`).toEqual(['template', 'script', 'style'])
    }
  })

  it('keeps Tailwind CSS v4 demo WeappTailwindcss configs explicit about cssEntries', () => {
    const demoRoot = path.resolve(__dirname, '../demo')
    const sharedWebConfigs = [
      'web/shared/vite-target.ts',
      'web/shared/webpack-plugin-target.mjs',
    ]
    for (const relative of sharedWebConfigs) {
      const code = fs.readFileSync(path.join(demoRoot, relative), 'utf8')
      expect(code, `demo/${relative} should declare Tailwind v4 CSS entries explicitly`).toContain('cssEntries')
      expect(code, `demo/${relative} should not resolve cssEntries from process.cwd()`).not.toContain('resolve(process.cwd()')
      expect(code, `demo/${relative} should not resolve cssEntries from process.cwd()`).not.toContain('path.resolve(process.cwd()')
    }

    for (const file of collectDemoWeappTailwindcssConfigFiles()) {
      const relative = path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/')
      const code = fs.readFileSync(file, 'utf8')
      if (relative.startsWith('demo/web/') && code.includes('createWebDemoWeappTailwindcss')) {
        expect(code, `${relative} should derive a stable project root from the config file URL`).toContain('fileURLToPath(import.meta.url)')
        expect(code, `${relative} should pass a stable project root into the shared cssEntries helper`)
          .toMatch(/createWebDemoWeappTailwindcss(?:Plugins|WebpackPlugin)\((?:projectRoot|root)\)/)
      }
      else {
        expect(code, `${relative} should declare Tailwind v4 CSS entries explicitly`).toContain('cssEntries')
      }
      expect(code, `${relative} should not resolve cssEntries from process.cwd()`).not.toContain('resolve(process.cwd()')
      expect(code, `${relative} should not resolve cssEntries from process.cwd()`).not.toContain('path.resolve(process.cwd()')
    }
  })

  it('requires Tailwind CSS v4 demos to declare official PostCSS parity dependency', () => {
    const demoRoot = path.resolve(__dirname, '../demo')
    const missing: string[] = []

    for (const name of fs.readdirSync(demoRoot)) {
      const packageJson = path.join(demoRoot, name, 'package.json')
      if (!fs.existsSync(packageJson)) {
        continue
      }
      const pkg = readDemoPackageJson(path.relative(path.resolve(__dirname, '..'), packageJson))
      const dependencies = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }
      if (dependencies.tailwindcss !== 'catalog:tailwindcss4' || !dependencies['weapp-tailwindcss']) {
        continue
      }
      if (name.startsWith('issue-')) {
        continue
      }
      if (dependencies['@tailwindcss/postcss'] !== 'catalog:tailwindcss4') {
        missing.push(name)
      }
    }

    expect(missing.sort()).toEqual([])
  })

  it('wires automated demo hot-update coverage to known watch cases', () => {
    expect(getAutomatedHotUpdateDemoNames()).toEqual(getDefaultHotUpdateDemoNames())
  })

  it('runs Iconify bracket icon probes in every automated mini-program and H5 watch-HMR case', () => {
    const watchCases = new Map(
      buildCases(path.resolve(__dirname, '..'), { includeLocalOnly: true }).map(item => [item.name, item]),
    )

    for (const entry of DEMO_COVERAGE_MATRIX) {
      if (entry.name.startsWith('web/') || entry.framework === 'style-injector') {
        continue
      }
      for (const platform of entry.platforms.filter(platform => platform.hmrCoverage === 'automated')) {
        const caseName = platform.platform === 'h5'
          ? entry.name
          : (watchCases.has(`${entry.name}:${platform.platform}`) ? `${entry.name}:${platform.platform}` : entry.name)
        const watchCase = watchCases.get(caseName)
        expect(watchCase, `${entry.name} ${platform.platform} should have a watch-HMR case`).toBeDefined()
        if (platform.platform === 'h5') {
          expect(watchCase?.webHmr?.iconifyHmr, `${entry.name} H5 watch-HMR should enable Iconify probe`).toBeDefined()
        }
        else {
          expect(watchCase?.iconifyHmr, `${entry.name} ${platform.platform} watch-HMR should enable Iconify probe`).toBeDefined()
        }
      }
    }
  })

  it('requires every mini-program demo to run IDE class HMR and visual HMR screenshots', () => {
    if (process.env['E2E_PROJECT_FILTER']) {
      return
    }

    const demoNames = DEMO_COVERAGE_MATRIX
      .filter(item => !item.name.startsWith('web/'))
      .filter(item => !item.name.startsWith('issue-'))
      .filter(item => !item.name.startsWith('subpackage-'))
      .filter(item => item.framework !== 'style-injector')
      .filter(item => !item.skipVisualHmr)
      .map(item => item.name)
      .sort()
    const ideCaseNames = getFrameworkIdeCases().map(item => item.name).sort()
    const visualCaseNames = E2E_PROJECTS.map(item => item.name).sort()

    expect(ideCaseNames).toEqual(demoNames)
    expect(visualCaseNames).toEqual(demoNames)
    expect(Object.keys(frameworkIdeWatchCaseNames).sort()).toEqual(demoNames)

    for (const item of E2E_PROJECTS) {
      expect(item.skipOpenAutomator, `${item.name} should open in IDE visual HMR`).toBeUndefined()
    }
  })

  it('keeps every automated mini-program demo in the dynamic arbitrary-value CSS regression', () => {
    const regressionCaseNames = E2E_PROJECTS
      .filter(item => !DEMO_COVERAGE_MATRIX.find(entry => entry.name === item.name)?.hbuilderxLocal)
      .map(item => item.name)
      .sort()
    const expectedNames = DEMO_COVERAGE_MATRIX
      .filter(item => item.platforms.some(platform => platform.hmrCoverage === 'automated'))
      .filter(item => !item.hbuilderxLocal)
      .filter(item => !item.name.startsWith('web/'))
      .map(item => item.name)
      .sort()

    expect(regressionCaseNames).toEqual(expectedNames)
  })

  it('keeps dynamic regression coverage for script-origin class strings', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './all-demos-dynamic-class-regression.test.ts'), 'utf8')
    expect(source).toContain('scriptOnlyClasses')
    expect(source).toContain('scriptOnlyClassName')
    expect(source).toContain('should transform script-only')
    expect(source).toContain('habitClasses')
    expect(source).toContain('habitClassName')
    expect(source).toContain('should transform habit')
  })

  it('keeps IDE visual HMR in the demo workflow and full IDE command', () => {
    const rootPackageJson = readDemoPackageJson('package.json')
    const workflow = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-e2e-workflow.ts'), 'utf8')
    const visualScript = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-visual-e2e-report.ts'), 'utf8')
    const visualHmr = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-visual-e2e-report/hmr.ts'), 'utf8')

    expect(rootPackageJson.scripts?.['e2e:ide:visual']).toContain('--weapp-only --fail-on-incomplete')
    expect(rootPackageJson.scripts?.['e2e:ide:issues-909-916-928']).toContain('e2e/issue-909-ide.test.ts')
    expect(rootPackageJson.scripts?.['e2e:ide:issues-909-916-928:skip-build']).toContain('E2E_SKIP_BUILD=1')
    expect(rootPackageJson.scripts?.['e2e:ide:issue-909']).toBe('pnpm e2e:ide:issues-909-916-928')
    expect(rootPackageJson.scripts?.['e2e:ide:where']).toContain('e2e/where-selector-ide.test.ts')
    const fullIdeScript = rootPackageJson.scripts?.['e2e:ide:full'] ?? ''
    expect(fullIdeScript).toContain('pnpm e2e:ide')
    expect(fullIdeScript).toContain('pnpm e2e:ide:issues-909-916-928')
    expect(fullIdeScript).toContain('pnpm e2e:ide:where')
    expect(fullIdeScript).toContain('pnpm e2e:ide:visual')
    if (rootPackageJson.scripts?.['e2e:ide:root-selectors']) {
      expect(fullIdeScript).toContain('pnpm e2e:ide:root-selectors')
    }
    expect(visualScript).toContain('url: item.name.startsWith(\'mpx-\') ? \'/pages/index\' : \'/pages/index/index\'')
    expect(visualHmr).toContain('VISUAL_HMR_STEPS')
    expect(visualHmr.match(/bg-\[#/g)?.length, 'visual HMR should use multiple arbitrary bg values').toBeGreaterThanOrEqual(3)
    expect(workflow).toContain('args: [\'e2e:mp:ide\']')
  })

  it('keeps automated demo HMR platforms wired to screenshot visual HMR', () => {
    const visualScript = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-visual-e2e-report.ts'), 'utf8')
    const visualHmr = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-visual-e2e-report/hmr.ts'), 'utf8')
    const visualCaseNames = E2E_PROJECTS.map(item => item.name).sort()
    const h5VisualNames = [
      ...taroWebHmrCaseNames.map(name => name.replaceAll(' ', '-').replace('Tailwind-v', 'tailwindcss-v')),
      ...webViteHmrCoverageCaseNames.map(name => name.replace(/^web /, 'web/').replaceAll(' ', '-').replace('Tailwind-v', 'tailwindcss-v')),
      'uni-app-vite-tailwindcss-v4',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
      'issue-1144-uni-app-x-web',
      'uni-app-x-vdom-tailwindcss-v4',
    ].sort()

    const expectedWeappNames = DEMO_COVERAGE_MATRIX
      .filter(item => !item.name.startsWith('web/'))
      .filter(item => !item.name.startsWith('issue-'))
      .filter(item => !item.name.startsWith('subpackage-'))
      .filter(item => item.framework !== 'style-injector')
      .filter(item => !item.skipVisualHmr)
      .map(item => item.name)
      .sort()
    const expectedH5Names = DEMO_COVERAGE_MATRIX
      .filter(item => item.platforms.some(platform => platform.hmrCoverage !== 'exempt' && ['h5', 'web'].includes(platform.platform)))
      .map(item => item.name)
      .sort()

    expect(visualCaseNames).toEqual(expectedWeappNames)
    expect(h5VisualNames).toEqual(expectedH5Names)
    expect(visualScript).toContain('runH5Case(browser')
    expect(visualScript).toContain('runMiniProgramCase({')
    expect(visualScript).toContain('runNativeVisualCases(items, context, results)')
    expect(visualHmr).toContain('expectedBackgroundColor')
    expect(visualHmr).toContain('waitForVisualHmrStep')
  })

  it('keeps Android and iOS App HMR plus screenshots wired for uni-app Vite v4', () => {
    const rootPackageJson = readDemoPackageJson('package.json')
    const scripts = rootPackageJson.scripts ?? {}
    const visualApp = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-visual-e2e-report/app.ts'), 'utf8')
    const uniAppViteAppCases = uniAppAppCases.filter(item => item.projectDir === 'demo/uni-app-vite-tailwindcss-v4')

    expect(uniAppViteAppCases.map(item => item.platform).sort()).toEqual(['app-android', 'app-ios'])
    for (const item of uniAppViteAppCases) {
      expect(item.transformedOutputFiles, `${item.name} should assert App WebView runtime output`).toContain('app-service.js')
      expect(item.transformedContains, `${item.name} should assert initial App HMR marker`).toContain(`hbuilderx-app-dynamic-v4-${item.platform === 'app-android' ? 'android' : 'ios'}`)
      expect(item.hmrTransformedContains, `${item.name} should assert updated App HMR marker`).toContain(`hbuilderx-app-hmr-v4-${item.platform === 'app-android' ? 'android' : 'ios'}`)
    }

    expect(scripts['e2e:android']).toBe('pnpm e2e:android:hmr && pnpm e2e:android:visual')
    expect(scripts['e2e:android:hmr']).toBe('pnpm e2e:hbuilderx:android')
    expect(scripts['e2e:android:visual']).toContain('--android-only --fail-on-incomplete')
    expect(scripts['e2e:ios']).toBe('pnpm e2e:ios:hmr && pnpm e2e:ios:visual')
    expect(scripts['e2e:ios:hmr']).toBe('pnpm e2e:hbuilderx:ios')
    expect(scripts['e2e:ios:visual']).toContain('--ios-only --fail-on-incomplete')
    expect(scripts['e2e:app:visual']).toContain('--app-only --fail-on-incomplete')
    expect(visualApp).toContain('hmrBeforeScreenshot')
    expect(visualApp).toContain('hmrAfterScreenshot')
    expect(visualApp).toContain('DEMO_VISUAL_APP_HMR_MUTATION_DELAY_MS')
    expect(visualApp).not.toContain('DEMO_VISUAL_APP_HMR_RELAUNCH_DELAY_MS')
  })

  it('keeps demo workflow routed through composable platform e2e groups', () => {
    const rootPackageJson = readDemoPackageJson('package.json')
    const workflow = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-e2e-workflow.ts'), 'utf8')
    const workflowStep = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-e2e-workflow/step.ts'), 'utf8')
    const memoryReport = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-e2e-memory.ts'), 'utf8')
    const weappMemoryReport = fs.readFileSync(path.resolve(__dirname, '../scripts/demo-weapp-memory-report.ts'), 'utf8')
    const localFullReport = fs.readFileSync(path.resolve(__dirname, '../scripts/local-full-platform-report.ts'), 'utf8')
    const scripts = rootPackageJson.scripts ?? {}

    expect(scripts['e2e:demo:weapp-memory']).toBe('tsx scripts/demo-weapp-memory-report.ts --continue-on-error')
    expect(scripts['e2e:local:full-report']).toBe('tsx scripts/local-full-platform-report.ts')
    expect(scripts['e2e:uni-app-css-post-hmr']).toContain('e2e/watch/uni-app-css-post-hmr.test.ts')
    expect(scripts['e2e:mp']).toBe('pnpm e2e:static && pnpm e2e:hot-update:demo')
    expect(scripts['e2e:mp:ide']).toBe('pnpm e2e:ide:full')
    expect(scripts['e2e:h5']).toBe('pnpm e2e:taro:h5-build && pnpm e2e:taro:web-hmr && pnpm e2e:web:hmr')
    expect(scripts['e2e:app']).toBe('pnpm e2e:android && pnpm e2e:ios && pnpm e2e:harmony')
    expect(scripts['e2e:app:hmr']).toBe('pnpm e2e:hbuilderx:app')
    expect(scripts['e2e:app:visual']).toContain('--app-only --fail-on-incomplete')
    expect(scripts['e2e:hbuilderx:local:harmony']).toContain('E2E_HBUILDERX_APP_PLATFORM=app-harmony')
    expect(scripts['e2e:hbuilderx:local:demo']).toContain('E2E_HBUILDERX_LOCAL=1')
    expect(scripts['e2e:hbuilderx:local:demo']).toContain('E2E_HBUILDERX_CASE=uni-app-vite-vue3-hbuilderx-tailwindcss-v4,uni-app-x-vdom-tailwindcss-v4')
    expect(scripts['e2e:hbuilderx:local:demo:mp']).toContain('E2E_HBUILDERX_CASE_GROUP=mp')
    expect(scripts['e2e:hbuilderx:local:demo:mp-extra']).toBe('pnpm e2e:hbuilderx:local:demo:mp-alipay && pnpm e2e:hbuilderx:local:demo:mp-baidu && pnpm e2e:hbuilderx:local:demo:mp-toutiao')
    expect(scripts['e2e:hbuilderx:local:demo:mp-alipay']).toContain('E2E_HBUILDERX_MP_PLATFORM=mp-alipay')
    expect(scripts['e2e:hbuilderx:local:demo:mp-baidu']).toContain('E2E_HBUILDERX_MP_PLATFORM=mp-baidu')
    expect(scripts['e2e:hbuilderx:local:demo:mp-toutiao']).toContain('E2E_HBUILDERX_MP_PLATFORM=mp-toutiao')
    expect(scripts['e2e:hbuilderx:local:mp-alipay']).toContain('E2E_HBUILDERX_MP_PLATFORM=mp-alipay')
    expect(scripts['e2e:hbuilderx:local:mp-baidu']).toContain('E2E_HBUILDERX_MP_PLATFORM=mp-baidu')
    expect(scripts['e2e:hbuilderx:local:mp-toutiao']).toContain('E2E_HBUILDERX_MP_PLATFORM=mp-toutiao')
    expect(scripts['e2e:hbuilderx:local:demo:web']).toContain('E2E_HBUILDERX_CASE_GROUP=web')
    expect(scripts['e2e:ci']).not.toContain('e2e:hbuilderx:local:demo')
    expect(scripts['e2e:ci']).not.toContain('e2e:hbuilderx:local:demo:mp-extra')
    expect(workflow).toContain('writeDemoE2eMemoryReport')
    expect(workflow).toContain('runStep')
    expect(workflowStep).toContain('sampleProcessTree')
    expect(memoryReport).toContain('\'e2e\', \'.artifacts\', \'demo-e2e-memory\'')
    expect(weappMemoryReport).toContain('buildScriptCommand')
    expect(weappMemoryReport).toContain('--filter')
    expect(weappMemoryReport).toContain('--from-raw')
    expect(weappMemoryReport).toContain('createProjectFromRawReports')
    expect(weappMemoryReport).toContain('未找到 raw/')
    expect(weappMemoryReport).toContain('E2E_HOT_UPDATE_CASE_NAME')
    expect(weappMemoryReport).toContain('优化建议')
    expect(weappMemoryReport).toContain('WEAPP_TW_HMR_MEMORY_DEBUG')
    expect(weappMemoryReport).toContain('const measuredStages = stages.filter(stage => stage.status !== \'skipped\')')
    expect(localFullReport).toContain('e2e/reports/local-full-run')
    expect(localFullReport).toContain('hmr-full-report-')
    expect(localFullReport).toContain('visual-weapp-h5-app')
    expect(localFullReport).toContain('DEFAULT_H5_DEV_CASES')
    expect(localFullReport).toContain('h5-dev-')
    expect(localFullReport).toContain('uni-app-vite-tailwindcss-dev-h5.test.ts')
    expect(localFullReport).toContain('DEFAULT_MINI_CASES')
    expect(localFullReport).toContain('uni-app-vite-tailwindcss-v4')
    expect(localFullReport).toContain('uni-app-vite-tailwindcss-v4')
    expect(localFullReport).toContain('DEFAULT_PLATFORM_BUILD_CASES')
    expect(localFullReport).toContain('LOCAL_FULL_REPORT_PLATFORM_BUILD_CASES')
    expect(localFullReport).toContain('const fastHmr = profile === \'smoke\' || profile === \'hmr-smoke\'')
    expect(localFullReport).toContain('...buildPlatformBuildSteps()')
    expect(localFullReport).toContain('exactMultiplatformBuildCase')
    expect(localFullReport).toContain('escapeRegExp')
    expect(localFullReport).toContain('platformReports')
    expect(localFullReport).toContain('## 全端平台数据')
    expect(localFullReport).toContain('E2E_MULTIPLATFORM_BUILD_CASE')
    expect(localFullReport).toContain('build source/note')
    expect(localFullReport).toContain('runtime/HMR source/note')

    for (const scriptName of ['e2e:static', 'e2e:multiplatform-build', 'e2e:hot-update:demo', 'e2e:h5', 'e2e:uni:h5', 'e2e:hbuilderx:mp', 'e2e:hbuilderx:h5', 'e2e:android', 'e2e:ios', 'e2e:harmony']) {
      expect(workflow).toContain(`args: ['${scriptName}']`)
    }
  })

  it('wires SFC-like automated hot-update demos to template/script/style report assertions', () => {
    expect(getAutomatedThreeBlockHotUpdateDemoNames()).toEqual([
      'mpx-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
    ])
  })

  it('wires web demo HMR matrix entries to browser HMR cases', () => {
    const expectedNames = DEMO_COVERAGE_MATRIX
      .filter(item => item.name.startsWith('web/'))
      .map(item => item.name.replace('web/', 'web ').replaceAll('-', ' '))
      .map(item => item.replace('tailwindcss v', 'Tailwind v'))

    expect(webViteHmrCoverageCaseNames).toEqual(expectedNames)
  })

  it('wires every Taro demo H5 platform to browser HMR cases', () => {
    const expectedNames = DEMO_COVERAGE_MATRIX
      .filter(item => item.framework === 'taro-react' || item.framework === 'taro-vue3')
      .filter(item => item.platforms.some(platform => platform.platform === 'h5' && platform.hmrCoverage === 'automated'))
      .map(item => item.name.replaceAll('-', ' '))
      .map(item => item.replace('tailwindcss v', 'Tailwind v'))

    expect(taroWebHmrCaseNames).toEqual(expectedNames)

    for (const entry of DEMO_COVERAGE_MATRIX
      .filter(item => item.framework === 'taro-react' || item.framework === 'taro-vue3')
      .filter(item => item.platforms.some(platform => platform.hmrCoverage === 'automated'))) {
      const weapp = entry.platforms.find(item => item.platform === 'weapp')
      const h5 = entry.platforms.find(item => item.platform === 'h5')
      expect(weapp?.hmrCoverage, `${entry.name} should automate mini-program HMR`).toBe('automated')
      expect(h5?.hmrCoverage, `${entry.name} should automate H5 browser HMR`).toBe('automated')
      expect(h5?.command, `${entry.name} H5 should run the Taro browser HMR suite`).toContain('e2e:taro:web-hmr')
    }
  })

  it('keeps uni-app and uni-app x demo workflow coverage explicit for mini-program, web, Android, iOS and Harmony', () => {
    const expectedPlatformsByName = new Map([
      ['uni-app-vite-tailwindcss-v4', ['mp-weixin', 'h5', 'app-android', 'app-ios']],
      ['uni-app-vite-tailwindcss-v4', ['mp-weixin', 'h5', 'app-android', 'app-ios']],
      ['subpackage-uni-app-vite-tailwindcss-v4', ['mp-weixin', 'h5', 'app-android', 'app-ios']],
      ['uni-app-vite-vue3-hbuilderx-tailwindcss-v4', ['mp-weixin', 'mp-alipay', 'mp-baidu', 'mp-toutiao', 'h5', 'app-android', 'app-ios']],
      ['uni-app-vite-vue3-hbuilderx-tailwindcss-v4', ['mp-weixin', 'mp-alipay', 'mp-baidu', 'mp-toutiao', 'h5', 'app-android', 'app-ios']],
      ['uni-app-x-vdom-tailwindcss-v4', ['mp-weixin', 'h5', 'app-android', 'app-ios', 'app-harmony']],
      ['uni-app-x-vdom-tailwindcss-v4', ['mp-weixin', 'h5', 'app-android', 'app-ios', 'app-harmony']],
    ])

    for (const [name, platforms] of expectedPlatformsByName) {
      const entry = DEMO_COVERAGE_MATRIX.find(item => item.name === name)
      expect(entry, `${name} should exist in DEMO_COVERAGE_MATRIX`).toBeDefined()
      for (const platform of platforms) {
        const coverage = entry?.platforms.find(item => item.platform === platform)
        expect(coverage, `${name} should declare ${platform}`).toBeDefined()
        expect(coverage?.command.length, `${name} ${platform} should document workflow command`).toBeGreaterThan(0)
        if (platform === 'app-android' || platform === 'app-ios' || platform === 'app-harmony') {
          if (name.startsWith('subpackage-')) {
            expect(coverage?.hmrCoverage, `${name} ${platform} should document local-only App coverage without HMR`).toBe('exempt')
            expect(coverage?.evidence, `${name} ${platform} should document App local evidence`).toContain('documented App')
          }
          else {
            expect(coverage?.hmrCoverage, `${name} ${platform} should be local HBuilderX coverage`).toBe('local')
            expect(coverage?.evidence, `${name} ${platform} should point at HBuilderX evidence`).toContain('hbuilderx')
          }
        }
        if (name.includes('hbuilderx') && (platform === 'mp-alipay' || platform === 'mp-baidu' || platform === 'mp-toutiao')) {
          expect(coverage?.staticCoverage, `${name} ${platform} should be local HBuilderX coverage`).toBe('local')
          expect(coverage?.command, `${name} ${platform} should point at platform-filtered HBuilderX case`).toContain(`E2E_HBUILDERX_MP_PLATFORM=${platform}`)
        }
      }
    }
  })

  it('wires local/default platform entries to the multiplatform target matrix', () => {
    const targets = new Set(MULTIPLATFORM_TARGETS.map(item => `${item.projectDir.replace('demo/', '')}:${item.platform}`))
    for (const entry of DEMO_COVERAGE_MATRIX.filter(item => ['mpx', 'taro-react', 'taro-vue3', 'uni-app', 'uni-app-x'].includes(item.framework))) {
      for (const platform of entry.platforms) {
        if (platform.staticCoverage === 'exempt' && platform.hmrCoverage === 'exempt') {
          continue
        }
        if (entry.hbuilderxLocal && entry.framework === 'uni-app') {
          continue
        }
        if (entry.hbuilderxLocal && entry.framework === 'uni-app-x' && platform.platform === 'h5') {
          continue
        }
        expect(targets.has(`${entry.name}:${platform.platform}`), `${entry.name} ${platform.platform} should be in MULTIPLATFORM_TARGETS`).toBe(true)
      }
    }
  })

  it('keeps every demo platform mapped to build output, browser HMR, IDE, or HBuilderX local evidence', () => {
    const outputCases = new Map(MULTIPLATFORM_BUILD_OUTPUT_CASES.map(item => [outputCaseKey(item), item]))
    const hbuilderMiniCases = new Set(miniProgramCases.map(item => demoPlatformKey(item.projectDir.replace('demo/', ''), item.platform)))
    const hbuilderWebCases = new Set(webCases.map(item => demoPlatformKey(item.projectDir.replace('demo/', ''), 'h5')))
    const hbuilderAppCases = new Set([...uniAppAppCases, ...uniAppXAppCases].map(item => demoPlatformKey(item.projectDir.replace('demo/', ''), item.platform)))
    const visualMiniProgramCases = new Set(E2E_PROJECTS.map(item => demoPlatformKey(item.name, 'weapp')))
    const taroBrowserCases = new Set(taroWebHmrCaseNames.map(name => demoPlatformKey(name.replaceAll(' ', '-').replace('Tailwind-v', 'tailwindcss-v'), 'h5')))
    const webBrowserCases = new Set(webViteHmrCoverageCaseNames.map(name => demoPlatformKey(name.replace(/^web /, 'web/').replaceAll(' ', '-').replace('Tailwind-v', 'tailwindcss-v'), 'web')))

    for (const entry of DEMO_COVERAGE_MATRIX) {
      for (const platform of entry.platforms) {
        const key = demoPlatformKey(entry.name, platform.platform)
        const hasEvidence
          = hasBuildOutputEvidence(entry.name, platform.platform, outputCases)
            || hbuilderMiniCases.has(key)
            || hbuilderWebCases.has(key)
            || hbuilderAppCases.has(key)
            || visualMiniProgramCases.has(key)
            || taroBrowserCases.has(key)
            || webBrowserCases.has(key)
            || platform.evidence.includes('demo:web:compare')
            || platform.evidence.includes('multiplatform target matrix')
            || (platform.command.includes('E2E_HBUILDERX_LOCAL=1') && Boolean(platform.reason))

        expect(hasEvidence, `${entry.name} ${platform.platform} should have executable or documented local e2e evidence`).toBe(true)
      }
    }
  })

  it('keeps Android and Harmony local App cases backed by transformed output and HMR assertions', () => {
    const appCases = [...uniAppAppCases, ...uniAppXAppCases]
    const expectedKeys = DEMO_COVERAGE_MATRIX
      .flatMap(entry => entry.platforms
        .filter(platform => platform.platform === 'app-android' || platform.platform === 'app-harmony')
        .filter(platform => platform.evidence.includes('hbuilderx local'))
        .map(platform => demoPlatformKey(entry.name, platform.platform)))
      .sort()
    const actualKeys = appCases
      .filter(item => item.platform === 'app-android' || item.platform === 'app-harmony')
      .map(item => demoPlatformKey(item.projectDir.replace('demo/', ''), item.platform))
      .sort()

    expect(actualKeys).toEqual(expectedKeys)

    for (const item of appCases.filter(item => item.platform === 'app-android' || item.platform === 'app-harmony')) {
      expect(item.transformedContains.length, `${item.name} should assert transformed App output`).toBeGreaterThan(0)
      expect(item.hmrTransformedContains.length, `${item.name} should assert transformed App HMR output`).toBeGreaterThan(0)
      expect(item.markerClass, `${item.name} should mutate a Tailwind arbitrary class`).toContain('bg-[#')
      expect(item.hmrMarkerClass, `${item.name} should mutate a Tailwind arbitrary HMR class`).toContain('bg-[#')
      expect(item.requiredFiles.length, `${item.name} should assert required App output files`).toBeGreaterThan(0)
    }
  })

  it('keeps non-WeChat mini-program style outputs in Taro and uni-app build regressions', () => {
    const cases = new Set(MULTIPLATFORM_BUILD_OUTPUT_CASES.map(item => `${item.projectDir.replace('demo/', '')}:${item.platform}`))
    expect(cases.has('uni-app-vite-tailwindcss-v4:mp-alipay')).toBe(true)
    expect(cases.has('uni-app-vite-tailwindcss-v4:mp-toutiao')).toBe(true)
    expect(cases.has('uni-app-vite-tailwindcss-v4:mp-alipay')).toBe(true)
    expect(cases.has('uni-app-vite-tailwindcss-v4:mp-jd')).toBe(true)
    expect(cases.has('uni-app-vite-tailwindcss-v4:mp-toutiao')).toBe(true)
    expect(cases.has('taro-vite-react-tailwindcss-v4:tt')).toBe(true)
    expect(cases.has('taro-vite-vue3-tailwindcss-v4:tt')).toBe(true)
    expect(cases.has('subpackage-taro-webpack-react-tailwindcss-v4:tt')).toBe(true)
    expect(cases.has('subpackage-uni-app-vite-tailwindcss-v4:mp-toutiao')).toBe(true)
  })

  it('covers every static e2e project with hot-update or an explicit exemption', () => {
    const hotUpdateCoveredProjects = HOT_UPDATE_COVERED_PROJECTS as ReadonlySet<string>
    const hotUpdateExemptProjects = HOT_UPDATE_EXEMPT_PROJECTS as ReadonlySet<string>
    const uncovered = getAllStaticE2EProjectNames().filter((name) => {
      return !hotUpdateCoveredProjects.has(name) && !hotUpdateExemptProjects.has(name)
    })

    expect(uncovered).toEqual([])
  })

  it('keeps the static e2e project matrix explicit', () => {
    expect(getAllStaticE2EProjectNames()).toEqual([
      'gulp-tailwindcss-v4',
      'mpx-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
      'uni-app-x-vdom-tailwindcss-v4',
      'weapp-vite-tailwindcss-v4',
    ])
  })

  it('covers every demo/web package with browser source HMR', () => {
    const expectedNames = DEMO_COVERAGE_MATRIX
      .filter(item => item.name.startsWith('web/'))
      .map(item => item.name.replace('web/', 'web ').replaceAll('-', ' '))
      .map(item => item.replace('tailwindcss v', 'Tailwind v'))

    expect(webViteHmrCoverageCaseNames).toEqual(expectedNames)
  })

  it('covers every Taro demo package with browser source HMR', () => {
    expect(taroWebHmrCaseNames).toEqual([
      'taro vite react Tailwind v4',
      'taro vite vue3 Tailwind v4',
      'taro webpack react Tailwind v4',
      'taro webpack vue3 Tailwind v4',
    ])
  })
})
