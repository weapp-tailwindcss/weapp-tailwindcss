import fs from 'node:fs'
import path, { posix, win32 } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { DEMO_COVERAGE_MATRIX } from './demoCoverageMatrix'
import { EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES } from './multiplatform-build-output/cases'
import { MULTIPLATFORM_TARGETS } from './multiplatform-build-output/targets'
import { E2E_PROJECTS } from './projectEntries'
import { taroWebHmrCases } from './taro-web-demo-hmr-cases'

const repoRoot = path.resolve(__dirname, '..')
const coreTaroDemos = [
  'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
] as const
const styleInjectorTaroDemos = [
  'style-injector-taro-vite-react',
  'style-injector-taro-webpack-react',
] as const
const taroViteDemoConfigs = [
  'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4',
  'issue-951-taro-vite-react-tailwindcss-v4',
] as const
const taroViteTemplateConfigs = [
  'taro-vite-tailwindcss-v4',
] as const
const taroViteWatchCaseEnv = 'TARO_E2E_WATCH_NATIVE=1 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_TIMEOUT_MS=60000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=10000 E2E_WATCH_COMMAND_TIMEOUT_MS=600000'
const taroWebpackWatchCaseEnv = 'TARO_E2E_WATCH_NATIVE=0 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=8000 E2E_WATCH_COMMAND_TIMEOUT_MS=900000'

const requiredScripts = ['build:weapp', 'dev:weapp', 'build:h5', 'dev:h5'] as const
const forbiddenTailwindGeneratorPlugins = [
  '@tailwindcss/postcss',
  '@tailwindcss/vite',
] as const
const forbiddenTaroViteConfigCompatSnippets = [
  'taroAlipayBrowserslistAssetPlugin',
  'taro-alipay-browserslist-asset',
  'taro-cjs-stability',
  'transformMixedEsModules',
  'bundle[\'.browserslistrc\']',
  'fileName: \'.browserslistrc\'',
] as const

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
}

function readText(file: string) {
  return fs.readFileSync(file, 'utf8')
}

function demoPackageJson(name: string) {
  return readJson(path.join(repoRoot, 'demo', name, 'package.json'))
}

function configFiles(name: string) {
  const configRoot = path.join(repoRoot, 'demo', name, 'config')
  return fs.readdirSync(configRoot)
    .filter(file => /\.[cm]?ts$|\.js$/.test(file))
    .map(file => path.join(configRoot, file))
}

function taroHmrCaseName(name: string) {
  return name.replaceAll('-', ' ').replace('tailwindcss v', 'Tailwind v')
}

describe('Taro CI coverage matrix', () => {
  it('聚合构建跳过的每个 Taro demo 都有同一微信目标的真实构建入口', () => {
    const guardedProjects = fs.readdirSync(path.join(repoRoot, 'demo'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(repoRoot, 'demo', entry.name, 'package.json')))
      .map(entry => entry.name)
      .filter(name => Object.values(demoPackageJson(name).scripts ?? {}).some(script => script.includes('taro-build-guard.mjs')))
    expect(guardedProjects.length).toBeGreaterThan(0)

    for (const name of guardedProjects) {
      if (E2E_PROJECTS.some(item => item.name === name)) {
        expect(fs.existsSync(path.join(repoRoot, 'e2e', `${name}.test.ts`)), `${name} 应保留 static 构建入口`).toBe(true)
        continue
      }
      const projectDir = `demo/${name}`
      const cases = EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES.filter(item => item.projectDir === projectDir && item.platform === 'weapp' && item.status === 'ci')
      expect(cases.length, `${name} 不能用其他平台或 local 占位项代替微信构建`).toBeGreaterThan(0)
      expect(MULTIPLATFORM_TARGETS.find(item => item.projectDir === projectDir && item.platform === 'weapp')?.coverage).toBe('default-ci')
      for (const item of cases) {
        expect(item.command, item.name).toContain('build:weapp')
        expect(item.styleFileExtensions, item.name).toContain('.wxss')
        expect(item.requiredFiles.some(file => file.endsWith('.wxss')), item.name).toBe(true)
      }
    }
  })

  it('微信分包构建保留独立入口与单入口两个隔离语义', () => {
    const cases = EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES.filter(item => item.projectDir === 'demo/subpackage-taro-webpack-react-tailwindcss-v4' && item.platform === 'weapp' && item.status === 'ci')
    expect(cases.map(item => item.name)).toEqual([
      'subpackage-taro-webpack-react-tailwindcss-v4 weapp isolated',
      'subpackage-taro-webpack-react-tailwindcss-v4 weapp single',
    ])
    expect(cases[0]?.fileAssertions?.some(item => item.file === 'dist/sub-independent/pages/index.wxss')).toBe(true)
    expect(cases[1]?.env?.E2E_TW_CSS_ENTRY_MODE).toBe('single')
    expect(cases.every(item => item.requiredFiles.includes('dist/pages/index/index.wxml'))).toBe(true)
    const coverage = DEMO_COVERAGE_MATRIX.find(item => item.name === 'subpackage-taro-webpack-react-tailwindcss-v4')?.platforms.find(item => item.platform === 'weapp')
    expect(coverage?.staticCoverage).toBe('automated')
    expect(coverage?.command).toContain('pnpm e2e:multiplatform-build')
  })

  it('分包构建显式固定入口模式，不继承终端的 single 设置', () => {
    const cases = EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES.filter(item => item.projectDir.includes('subpackage-'))
    expect(cases.length).toBeGreaterThan(0)
    for (const item of cases) {
      const mode = item.name.endsWith(' single') ? 'single' : 'isolated'
      expect(item.env?.E2E_TW_CSS_ENTRY_MODE, item.name).toBe(mode)
    }
  })

  it.each([
    { platform: 'weapp', style: '.wxss', template: '.wxml' },
    { platform: 'alipay', style: '.acss', template: '.axml' },
    { platform: 'tt', style: '.ttss', template: '.ttml' },
  ])('issue951 $platform 保留对应平台产物与主包样式导入关系', ({ platform, style, template }) => {
    const item = EXECUTABLE_MULTIPLATFORM_BUILD_OUTPUT_CASES.find(item => item.projectDir === 'demo/issue-951-taro-vite-react-tailwindcss-v4' && item.platform === platform)
    expect(item?.status).toBe('ci')
    expect(item?.requiredFiles).toContain(`dist/pages/index/index${template}`)
    expect(item?.styleFileExtensions).toEqual([style])
    const assertion = item?.fileAssertions?.find(item => item.file === `dist/app${style}`)
    const importPattern = assertion?.contains?.find(item => item instanceof RegExp) as RegExp
    expect(`@import "./app-origin${style}";`).toMatch(importPattern)
    expect(`@import './app-origin${style}';`).toMatch(importPattern)
    expect(`@import "./app-originX${style.slice(1)}";`).not.toMatch(importPattern)
    expect(assertion?.notContains).toEqual(expect.arrayContaining(['.bg-issue-951-normal', '.bg-issue-951-independent']))
  })

  it('guards style-injector Taro mini-program builds in aggregate CI', () => {
    for (const name of styleInjectorTaroDemos) {
      const scripts = demoPackageJson(name).scripts ?? {}
      expect(scripts['build:weapp'], `${name} mini-program build should use the guarded Taro build entry`).toContain('taro-build-guard.mjs')
    }
  })

  it('declares the four core Taro demos with mini-program and H5 build/dev scripts', () => {
    const entries = DEMO_COVERAGE_MATRIX
      .filter(item => item.framework === 'taro-react' || item.framework === 'taro-vue3')
      .filter(item => coreTaroDemos.includes(item.name as typeof coreTaroDemos[number]))
      .map(item => item.name)
      .sort()

    expect(entries).toEqual([...coreTaroDemos].sort())

    for (const name of coreTaroDemos) {
      const scripts = demoPackageJson(name).scripts ?? {}
      for (const script of requiredScripts) {
        expect(scripts[script], `${name} should expose ${script}`).toBeDefined()
      }
      expect(scripts['build:weapp'], `${name} mini-program build should use the guarded Taro build entry`).toContain('taro-build-guard.mjs')
      expect(scripts['dev:weapp'], `${name} mini-program dev should run the guarded build in watch mode`).toContain('--watch')
      expect(scripts['build:h5'], `${name} H5 build should use the Taro build runner`).toContain('taro-build-runner.mjs build --type h5')
      expect(scripts['dev:h5'], `${name} H5 dev should run Taro H5 watch`).toContain('taro build --type h5 --watch')
    }
  })

  it('wires all four Taro demos to CI-readable mini-program and H5 e2e evidence', () => {
    const rootScripts = readJson(path.join(repoRoot, 'package.json')).scripts ?? {}
    expect(rootScripts['e2e:taro']).toBe('pnpm e2e:taro:mp && pnpm e2e:taro:h5')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_PROJECT_FILTER="^taro-(vite|webpack)-(react|vue3)-tailwindcss-v4$"')
    expect(rootScripts['e2e:taro:mp']).toContain('TARO_E2E_WATCH_NATIVE=1')
    expect(rootScripts['e2e:taro:mp']).toContain('TARO_E2E_WATCH_NATIVE=0')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_WATCH_MINI_PROGRAM_ONLY=1')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_WATCH_TIMEOUT_MS=60000')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_WATCH_MAX_PLUGIN_PROCESS_MS=10000')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_WATCH_MAX_PLUGIN_PROCESS_MS=8000')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_WATCH_COMMAND_TIMEOUT_MS=600000')
    expect(rootScripts['e2e:taro:mp']).toContain('E2E_WATCH_COMMAND_TIMEOUT_MS=900000')
    expect(rootScripts['e2e:taro:mp']).not.toContain('E2E_WATCH_CASE=demo-taro-react')
    expect(rootScripts['e2e:taro:mp']).not.toContain('E2E_WATCH_CASE=demo-taro-vue3')
    for (const name of coreTaroDemos) {
      const watchCaseEnv = name.startsWith('taro-vite-') ? taroViteWatchCaseEnv : taroWebpackWatchCaseEnv
      expect(rootScripts['e2e:taro:mp'], `${name} should run as a standalone watch-HMR step`).toContain(`${watchCaseEnv} E2E_WATCH_CASE=${name} pnpm e2e:watch`)
    }
    expect(rootScripts['e2e:taro:h5']).toBe('pnpm e2e:taro:h5-build && pnpm e2e:taro:web-hmr')

    const staticMiniProgramProjects = new Set(E2E_PROJECTS.map(item => item.name))
    const h5HmrProjects = new Set(taroWebHmrCases.map(item => item.projectDir.replace('demo/', '')))
    const h5HmrCaseNames = new Set(taroWebHmrCases.map(item => item.name))
    const devSmokeSource = readText(path.join(repoRoot, 'e2e/watch/taro-demo-dev.test.ts'))

    for (const name of coreTaroDemos) {
      expect(staticMiniProgramProjects.has(name), `${name} should run static mini-program e2e build assertions`).toBe(true)
      expect(h5HmrProjects.has(name), `${name} should run browser H5 HMR e2e`).toBe(true)
      expect(h5HmrCaseNames.has(taroHmrCaseName(name)), `${name} should have a named H5 HMR case`).toBe(true)
      expect(fs.existsSync(path.join(repoRoot, `e2e/watch/hot-update/demo/${name}.test.ts`)), `${name} should have mini-program watch-HMR e2e`).toBe(true)
      expect(devSmokeSource, `${name} should be included in pnpm dev watch smoke`).toContain(`'${name}'`)
    }
  })

  it('keeps Taro configs on weapp-tailwindcss instead of official Tailwind generator plugins', () => {
    for (const name of coreTaroDemos) {
      const config = configFiles(name).map(readText).join('\n')
      expect(config, `${name} should register WeappTailwindcss`).toContain('WeappTailwindcss')
      expect(config, `${name} should declare cssEntries for Tailwind v4`).toContain('cssEntries')
      for (const plugin of forbiddenTailwindGeneratorPlugins) {
        expect(config, `${name} should not use ${plugin}`).not.toContain(plugin)
      }
    }
  })

  it.each(['taro-vite-react-tailwindcss-v4', 'taro-webpack-react-tailwindcss-v4'])('验证 %s 的跨平台 designWidth 行为', (name) => {
    const file = path.join(repoRoot, 'demo', name, 'config', 'index.ts')
    const ast = ts.createSourceFile(file, readText(file), ts.ScriptTarget.Latest, true)
    let expression: string | undefined
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'designWidth') {
        expression = node.initializer.getText(ast)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    expect(expression).toBeDefined()
    const evaluate = (isWeb: boolean, projectRoot: string) => runInNewContext(`(${expression})`, { taroPlatform: { isWeb }, win32, projectRoot }) as number | ((input?: { file?: string }) => number)
    for (const root of ['/workspace/project', 'C:\\workspace\\project']) {
      expect(evaluate(true, root)).toBe(750)
      const width = evaluate(false, root) as (input?: { file?: string }) => number
      expect(width({ file: win32.join(root, 'src', 'pages', 'issue-998', 'index.css') })).toBe(375)
      if (root.startsWith('/')) {
        expect(width({ file: posix.join(root, 'src', 'pages', 'issue-998', 'index.css') })).toBe(375)
      }
      expect(width({ file: 'src/pages/issue-998/index.css' })).toBe(375)
      expect(width({ file: 'src\\pages\\issue-998\\index.css' })).toBe(375)
      expect(width({ file: 'src/pages/issue-998-other/index.css' })).toBe(750)
      expect(width({ file: 'src/pages/issue-998/child/index.css' })).toBe(750)
      expect(width({ file: 'D:\\elsewhere\\src\\pages\\issue-998\\index.css' })).toBe(750)
      expect(width()).toBe(750)
    }
  })

  it('keeps Taro Vite demo and template configs free of compatibility plugins', () => {
    const configTargets = [
      ...taroViteDemoConfigs.map(name => ({
        name,
        files: configFiles(name),
      })),
      ...taroViteTemplateConfigs.map(name => ({
        name: `template:${name}`,
        files: configFiles(path.join('..', 'templates', name)),
      })),
    ]

    for (const target of configTargets) {
      const config = target.files.map(readText).join('\n')
      expect(config, `${target.name} should register WeappTailwindcss`).toContain('WeappTailwindcss')
      for (const snippet of forbiddenTaroViteConfigCompatSnippets) {
        expect(config, `${target.name} should rely on built-in Taro Vite compatibility instead of ${snippet}`).not.toContain(snippet)
      }
    }
  })
})
