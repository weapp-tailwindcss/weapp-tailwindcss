import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import fg from 'fast-glob'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { CANONICAL_TEMPLATE_CASES } from './canonicalTemplateMatrix'
import { readTemplatePageConfig, readTemplatePageConfigs } from './template-ide/config'
import { isTemplateVersionCompatible, TEMPLATE_PACKAGE_MANAGER } from './templateContract'

interface TemplateCase {
  name: string
  localOnlyReason?: string
  configFiles?: string[]
  configContains?: string[]
}

interface LocalOnlyBuildTarget {
  template: string
  script: string
  reason: string
}

interface TemplateBuildCase {
  name: string
  template: string
  command: string[]
  outputDir: string
  requiredFiles: string[]
  styleFiles?: string[]
  textFiles?: string[]
  expectTransformedClassMarkers?: boolean
}

interface OutputShape {
  styleFile: string
  pageFile: string
  appJsonFile?: string
}

const miniProgramMarkupExtensions = new Set(['axml', 'jxml', 'qml', 'swan', 'ttml', 'wxml', 'xhsml'])

const repoRoot = path.resolve(__dirname, '..')
const templatesRoot = path.resolve(repoRoot, 'templates')
const canonicalTemplateNames = new Set(
  CANONICAL_TEMPLATE_CASES
    .filter(item => item.template === 'weapp-vite-tailwindcss-v4')
    .map(item => item.template),
)

const taroMiniOutputByPlatform: Record<string, OutputShape> = {
  alipay: {
    styleFile: 'app.acss',
    pageFile: 'pages/index/index.axml',
  },
  jd: {
    styleFile: 'app.jxss',
    pageFile: 'pages/index/index.jxml',
  },
  qq: {
    styleFile: 'app.qss',
    pageFile: 'pages/index/index.qml',
  },
  swan: {
    styleFile: 'app.css',
    pageFile: 'pages/index/index.swan',
  },
  tt: {
    styleFile: 'app.ttss',
    pageFile: 'pages/index/index.ttml',
  },
  weapp: {
    styleFile: 'app.wxss',
    pageFile: 'pages/index/index.wxml',
  },
}

function getImportedStyleFiles(styleFile: string): string[] {
  const extension = path.extname(styleFile)
  const basename = styleFile.slice(0, -extension.length)
  return [`${basename}-origin${extension}`]
}

const uniMiniOutputByPlatform: Record<string, OutputShape> = {
  'mp-alipay': {
    styleFile: 'app.acss',
    pageFile: 'pages/index/index.axml',
  },
  'mp-baidu': {
    styleFile: 'app.css',
    pageFile: 'pages/index/index.swan',
  },
  'mp-jd': {
    styleFile: 'app.jxss',
    pageFile: 'pages/index/index.jxml',
  },
  'mp-kuaishou': {
    styleFile: 'app.css',
    pageFile: 'pages/index/index.ksml',
  },
  'mp-lark': {
    styleFile: 'app.ttss',
    pageFile: 'pages/index/index.ttml',
  },
  'mp-qq': {
    styleFile: 'app.qss',
    pageFile: 'pages/index/index.qml',
  },
  'mp-toutiao': {
    styleFile: 'app.ttss',
    pageFile: 'pages/index/index.ttml',
  },
  'mp-weixin': {
    styleFile: 'app.wxss',
    pageFile: 'pages/index/index.wxml',
  },
  'mp-xhs': {
    styleFile: 'app.css',
    pageFile: 'pages/index/index.xhsml',
  },
}

function createTaroMiniBuildCases(template: string, platforms = Object.keys(taroMiniOutputByPlatform)): TemplateBuildCase[] {
  return platforms.map((platform) => {
    const output = taroMiniOutputByPlatform[platform]
    return {
      name: `${template} ${platform}`,
      template,
      command: ['pnpm', 'run', `build:${platform}`],
      outputDir: 'dist',
      requiredFiles: [
        'dist/app.js',
        'dist/app.json',
        `dist/${output.styleFile}`,
        `dist/${output.pageFile}`,
      ],
      styleFiles: [`dist/${output.styleFile}`, ...getImportedStyleFiles(`dist/${output.styleFile}`)],
      textFiles: [`dist/${output.pageFile}`],
    }
  })
}

function createTaroH5BuildCase(template: string): TemplateBuildCase {
  return {
    name: `${template} h5`,
    template,
    command: ['pnpm', 'run', 'build:h5'],
    outputDir: 'dist',
    requiredFiles: ['dist/index.html'],
    styleFiles: ['dist/css'],
    textFiles: ['dist/index.html'],
    expectTransformedClassMarkers: false,
  }
}

function createUniMiniBuildCase(template: string, platform: keyof typeof uniMiniOutputByPlatform): TemplateBuildCase {
  const output = uniMiniOutputByPlatform[platform]
  const outputDir = `dist/build/${platform}`
  return {
    name: `${template} ${platform}`,
    template,
    command: ['pnpm', 'run', `build:${platform}`],
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/${output.appJsonFile ?? 'app.json'}`,
      `${outputDir}/${output.styleFile}`,
      `${outputDir}/${output.pageFile}`,
    ],
    styleFiles: [outputDir],
    textFiles: [`${outputDir}/${output.pageFile}`],
  }
}

function createUniH5BuildCase(template: string, script = 'build:h5', outputDir = 'dist/build/h5'): TemplateBuildCase {
  return {
    name: `${template} ${script.replace('build:', '')}`,
    template,
    command: ['pnpm', 'run', script],
    outputDir,
    requiredFiles: [`${outputDir}/index.html`],
    styleFiles: [`${outputDir}/assets`, `${outputDir}/static`, `${outputDir}/static/css`],
    textFiles: [`${outputDir}/index.html`],
    expectTransformedClassMarkers: false,
  }
}

function createUniH5SsrBuildCase(template: string): TemplateBuildCase {
  return {
    name: `${template} h5:ssr`,
    template,
    command: ['pnpm', 'run', 'build:h5:ssr'],
    outputDir: 'dist/build/h5',
    requiredFiles: [
      'dist/build/h5/client/index.html',
      'dist/build/h5/client/ssr-manifest.json',
      'dist/build/h5/server/entry-server.js',
      'dist/build/h5/server/index.html',
    ],
    styleFiles: ['dist/build/h5/client/assets'],
    textFiles: ['dist/build/h5/client/index.html', 'dist/build/h5/server/index.html'],
    expectTransformedClassMarkers: false,
  }
}

function createUniQuickappWebviewBuildCase(template: string, platform: string): TemplateBuildCase {
  const outputDir = `dist/build/${platform}`
  return {
    name: `${template} ${platform}`,
    template,
    command: ['pnpm', 'run', `build:${platform}`],
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/app.json`,
      `${outputDir}/app.css`,
    ],
    styleFiles: [outputDir],
    textFiles: [`${outputDir}/pages/index/index.js`],
  }
}

const templateCases: TemplateCase[] = [
  { name: 'mpx-tailwindcss-v4' },
  { name: 'taro-vite-tailwindcss-v4' },
  { name: 'taro-webpack-tailwindcss-v4' },
  {
    name: 'uni-app-hbuilderx-tailwindcss-v4',
    localOnlyReason: 'HBuilderX 模板没有提交可离线执行的 CLI build 脚本，默认回归检查依赖与 Vite 配置。',
    configFiles: ['vite.config.ts', 'main.css'],
    configContains: ['weapp-tailwindcss/vite', 'WeappTailwindcss', 'cssEntries'],
  },
  { name: 'uni-app-tailwindcss-v4' },
  { name: 'uni-app-webpack-tailwindcss-v4' },
]

const templateBuildCases: TemplateBuildCase[] = [
  {
    name: 'mpx-tailwindcss-v4 weixin',
    template: 'mpx-tailwindcss-v4',
    command: ['pnpm', 'run', 'build'],
    outputDir: 'dist/wx',
    requiredFiles: ['dist/wx/app.js', 'dist/wx/app.json', 'dist/wx/app.wxss', 'dist/wx/pages/index.wxml'],
    styleFiles: ['dist/wx/app.wxss', 'dist/wx/styles'],
    textFiles: ['dist/wx/pages/index.wxml'],
  },
  ...createTaroMiniBuildCases('taro-vite-tailwindcss-v4', ['weapp']),
  createTaroH5BuildCase('taro-vite-tailwindcss-v4'),
  ...createTaroMiniBuildCases('taro-webpack-tailwindcss-v4', ['alipay', 'jd', 'qq', 'swan', 'tt', 'weapp']),
  createTaroH5BuildCase('taro-webpack-tailwindcss-v4'),
  ...[
    'uni-app-tailwindcss-v4',
  ].flatMap<TemplateBuildCase>(template => [
    ...Object.keys(uniMiniOutputByPlatform).map(platform => createUniMiniBuildCase(template, platform)),
    createUniH5BuildCase(template),
    createUniH5SsrBuildCase(template),
    ...[
      'quickapp-webview',
      'quickapp-webview-huawei',
      'quickapp-webview-union',
    ].map(platform => createUniQuickappWebviewBuildCase(template, platform)),
  ]),
  ...[
    'uni-app-webpack-tailwindcss-v4',
  ].flatMap<TemplateBuildCase>(template => [
    ...['mp-alipay', 'mp-baidu', 'mp-kuaishou', 'mp-qq', 'mp-toutiao', 'mp-weixin']
      .map(platform => createUniMiniBuildCase(template, platform)),
    ...(template === 'uni-app-webpack-tailwindcss-v4'
      ? ['mp-jd', 'mp-lark', 'mp-xhs'].map(platform => createUniMiniBuildCase(template, platform))
      : []),
    createUniH5BuildCase(template),
    ...[
      'quickapp-webview',
      'quickapp-webview-huawei',
      'quickapp-webview-union',
    ].map(platform => createUniQuickappWebviewBuildCase(template, platform)),
  ]),
]

const localOnlyBuildTargets: LocalOnlyBuildTarget[] = [
  ...[
    'taro-vite-tailwindcss-v4',
    'taro-webpack-tailwindcss-v4',
  ].flatMap(template => [
    { template, script: 'build:rn', reason: 'Taro RN 构建需要 React Native 运行时与原生工程环境，不纳入默认模板 CLI 回归。' },
    ...(template === 'taro-vite-tailwindcss-v4'
      ? [
          { template, script: 'build:alipay', reason: 'Taro Vite alipay 当前在 @tarojs/vite-runner emit 阶段失败，默认模板回归保留 weapp/H5，其他端记录为本地跟踪项。' },
          { template, script: 'build:jd', reason: 'Taro Vite jd 当前依赖 Taro Vite 多小程序 emit 链路，默认模板回归保留 weapp/H5，其他端记录为本地跟踪项。' },
          { template, script: 'build:qq', reason: 'Taro Vite qq 当前依赖 Taro Vite 多小程序 emit 链路，默认模板回归保留 weapp/H5，其他端记录为本地跟踪项。' },
          { template, script: 'build:swan', reason: 'Taro Vite swan 当前依赖 Taro Vite 多小程序 emit 链路，默认模板回归保留 weapp/H5，其他端记录为本地跟踪项。' },
          { template, script: 'build:tt', reason: 'Taro Vite tt 当前依赖 Taro Vite 多小程序 emit 链路，默认模板回归保留 weapp/H5，其他端记录为本地跟踪项。' },
        ]
      : []),
    ...(template.includes('vue3') || template.includes('react')
      ? [{ template, script: 'build:quickapp', reason: 'Taro quickapp 需要快应用工具链，本轮只记录为本地环境验证项。' }]
      : []),
    ...(template.includes('vite') || template.includes('webpack-tailwindcss-v4')
      ? [{ template, script: 'build:harmony-hybrid', reason: 'Harmony hybrid 构建需要鸿蒙相关工具链，本轮只记录为本地环境验证项。' }]
      : []),
  ]),
  ...[
    'uni-app-tailwindcss-v4',
  ].flatMap(template => [
    { template, script: 'build:app', reason: 'uni-app app 端需要原生 App 构建环境，本轮只记录为本地环境验证项。' },
    { template, script: 'build:custom', reason: 'custom 构建脚本需要额外平台参数，本轮只记录为本地环境验证项。' },
  ]),
  ...[
    'uni-app-webpack-tailwindcss-v4',
  ].flatMap(template => [
    { template, script: 'build:app-plus', reason: 'app-plus 端需要原生 App 构建环境，本轮只记录为本地环境验证项。' },
    { template, script: 'build:custom', reason: 'custom 构建脚本需要额外平台参数，本轮只记录为本地环境验证项。' },
    { template, script: 'build:quickapp-native', reason: 'quickapp-native 需要快应用 native 工具链，本轮只记录为本地环境验证项。' },
    { template, script: 'build:mp-360', reason: 'mp-360 端依赖较旧平台工具链，本轮只记录为本地环境验证项。' },
  ]),
  { template: 'uni-app-hbuilderx-tailwindcss-v4', script: 'HBuilderX run', reason: '该模板未提交 CLI build 脚本，需要在 HBuilderX 中导入后运行。' },
]

const rawTailwindDirectiveRE = /(?:^|[;{}\n])\s*@(import\s+["']tailwindcss|tailwind|apply|theme|source)\b/
const styleFileRE = /\.(?:css|wxss|acss|jxss|qss|ttss)$/i
const textFileRE = /\.(?:cjs|css|html|js|json|mjs|ts|uvue|vue|wxss|wxml|axml|qml|swan|ttml)$/i

function getTemplateRoot(name: string) {
  return path.resolve(templatesRoot, name)
}

function shouldRunCase(name: string) {
  const filter = process.env['E2E_TEMPLATE_CASE']
  if (!filter) {
    return true
  }
  return new RegExp(filter).test(name)
}

async function pathExists(file: string) {
  try {
    await fs.access(file)
    return true
  }
  catch {
    return false
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

function resolveComponentPath(miniprogramRoot: string, pageJsonFile: string, componentPath: string) {
  if (/^(?:plugin|dynamicLib|ext):\/\//.test(componentPath)) {
    return undefined
  }
  if (componentPath.startsWith('/')) {
    return path.resolve(miniprogramRoot, componentPath.slice(1))
  }
  return path.resolve(path.dirname(pageJsonFile), componentPath)
}

function getMarkupExtension(pageFile: string) {
  return path.extname(pageFile).slice(1)
}

async function expectUsingComponentsExist(name: string, root: string, outputDir: string, pageFile: string) {
  const markupExtension = getMarkupExtension(pageFile)
  if (!miniProgramMarkupExtensions.has(markupExtension)) {
    return
  }

  const miniprogramRoot = path.resolve(root, outputDir)
  const relativePageFile = path.relative(outputDir, pageFile)
  const pageJsonFile = path.resolve(root, outputDir, relativePageFile.replace(new RegExp(`\\.${markupExtension}$`), '.json'))
  if (markupExtension !== 'wxml' && !await pathExists(pageJsonFile)) {
    return
  }

  const pageConfig = await readTemplatePageConfig(pageJsonFile)
  for (const [componentName, componentPath] of Object.entries(pageConfig.usingComponents ?? {})) {
    const resolved = resolveComponentPath(miniprogramRoot, pageJsonFile, componentPath)
    if (!resolved) {
      continue
    }
    expect(await pathExists(`${resolved}.json`), `${name} usingComponents.${componentName} should emit ${resolved}.json`).toBe(true)
    expect(await pathExists(`${resolved}.${markupExtension}`), `${name} usingComponents.${componentName} should emit ${resolved}.${markupExtension}`).toBe(true)
  }
}

async function readTextTargets(root: string, targets: string[], fileRE: RegExp) {
  const texts: string[] = []
  for (const target of targets) {
    const absolute = path.resolve(root, target)
    let stat
    try {
      stat = await fs.stat(absolute)
    }
    catch (error: any) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }
    if (stat.isFile()) {
      if (fileRE.test(absolute)) {
        texts.push(await fs.readFile(absolute, 'utf8'))
      }
      continue
    }

    const files = await fg('**/*', {
      absolute: true,
      cwd: absolute,
      onlyFiles: true,
    })
    for (const file of files.sort()) {
      if (fileRE.test(file)) {
        texts.push(await fs.readFile(file, 'utf8'))
      }
    }
  }
  return texts.join('\n')
}

async function runPnpm(args: string[], cwd: string) {
  await execa('pnpm', args, {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BROWSERSLIST_ENV: 'production',
      TARO_BUILD_STRICT: '1',
      UNI_BUILD_STRICT: '1',
      npm_package_json: path.resolve(cwd, 'package.json'),
      INIT_CWD: cwd,
    },
    stdio: process.env['E2E_DEBUG_BUILD'] === '1' ? 'inherit' : 'pipe',
  })
}

async function clearTemplateBuildState(root: string) {
  await fs.rm(path.resolve(root, 'dist'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'unpackage'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'node_modules/.cache'), { recursive: true, force: true })
  await fs.rm(path.resolve(root, 'node_modules/.vite'), { recursive: true, force: true })
}

describe('templates build smoke', () => {
  it('keeps every template covered by the template matrix', async () => {
    const dirs = await fg('*/package.json', {
      cwd: templatesRoot,
      onlyFiles: true,
    })
    const templateNames = dirs
      .map(file => file.split('/')[0])
      .filter(name => !canonicalTemplateNames.has(name))
      .sort()
    expect(templateCases.map(item => item.name).sort()).toEqual(templateNames)

    const executableTemplates = new Set(templateBuildCases.map(item => item.template))
    for (const item of templateCases) {
      if (executableTemplates.has(item.name)) {
        continue
      }
      expect(item.localOnlyReason, `${item.name} should document why it has config-only coverage`).toBeTruthy()
      expect(item.configFiles?.length, `${item.name} should define config smoke files`).toBeGreaterThan(0)
    }

    const executableBuildKeys = new Set(templateBuildCases.map(item => `${item.template}:${item.command[2]}`))
    const localOnlyBuildKeys = new Set(localOnlyBuildTargets.map(item => `${item.template}:${item.script}`))
    for (const template of templateCases) {
      const root = getTemplateRoot(template.name)
      const pkg = await readJson<{ scripts?: Record<string, string> }>(path.resolve(root, 'package.json'))
      for (const script of Object.keys(pkg.scripts ?? {}).filter(script => script.startsWith('build:'))) {
        const key = `${template.name}:${script}`
        expect(
          executableBuildKeys.has(key) || localOnlyBuildKeys.has(key),
          `${key} should be executable in template e2e or documented as local-only`,
        ).toBe(true)
      }
    }

    for (const item of localOnlyBuildTargets) {
      expect(item.reason, `${item.template} ${item.script} should explain local-only coverage`).toBeTruthy()
    }
  })

  it.each(templateCases.filter(item => shouldRunCase(item.name)))('$name template contract', async (item) => {
    const root = getTemplateRoot(item.name)
    const pkg = await readJson<{
      packageManager?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>(path.resolve(root, 'package.json'))
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    expect(pkg.packageManager, `${item.name} should pin pnpm`).toBe(TEMPLATE_PACKAGE_MANAGER)
    expect(pkg.scripts?.['up:pkg'], `${item.name} should expose interactive package upgrade`).toMatch(/^pnpm up -rLi\b/)
    expect(await pathExists(path.resolve(root, 'pnpm-lock.yaml')), `${item.name} should include its lockfile`).toBe(true)
    const workspace = await fs.readFile(path.resolve(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toContain('- .')
    expect(await fs.readFile(path.resolve(root, '.npmrc'), 'utf8')).toContain('registry=https://registry.npmjs.org/')

    expect(isTemplateVersionCompatible(deps['weapp-tailwindcss'])).toBe(true)
    expect(deps['@tailwindcss/postcss'], `${item.name} should not register the official PostCSS generator`).toBeUndefined()
    expect(deps['@tailwindcss/vite'], `${item.name} should not register the official Vite generator`).toBeUndefined()
    expect(pkg.scripts?.postinstall ?? '', `${item.name} should not patch Tailwind CSS`).not.toMatch(/weapp-tw\s+patch/u)

    if (Object.keys(deps).some(name => name.startsWith('@dcloudio/'))) {
      expect(pkg.scripts?.['up:pkg'], `${item.name} should keep @dcloudio upgrade out of generic package upgrade`).toContain('"!@dcloudio/*"')
    }

    if (item.configFiles) {
      for (const file of item.configFiles) {
        expect(await pathExists(path.resolve(root, file)), `${item.name} should include ${file}`).toBe(true)
      }
    }

    if (item.configContains) {
      const configText = await readTextTargets(root, item.configFiles ?? [], textFileRE)
      for (const needle of item.configContains) {
        expect(configText, `${item.name} config should contain ${needle}`).toContain(needle)
      }
    }
  })

  it.each(templateCases.filter(item => shouldRunCase(item.name)))('$name installs with its own frozen lockfile', async (item) => {
    if (process.env['E2E_TEMPLATE_SKIP_INSTALL'] === '1') {
      return
    }
    await runPnpm(['install', '--frozen-lockfile'], getTemplateRoot(item.name))
  }, 1_200_000)

  it.each(templateBuildCases.filter(item => shouldRunCase(item.name)))('$name build output', async (item) => {
    if (process.env['E2E_TEMPLATE_SKIP_BUILD'] === '1') {
      return
    }

    const root = getTemplateRoot(item.template)
    await clearTemplateBuildState(root)
    await runPnpm(item.command.slice(1), root)

    expect(await pathExists(path.resolve(root, item.outputDir)), `${item.name} should emit ${item.outputDir}`).toBe(true)
    if (item.requiredFiles.some(file => file.endsWith('.wxml'))) {
      await readTemplatePageConfigs(path.resolve(root, item.outputDir))
    }

    for (const file of item.requiredFiles) {
      expect(await pathExists(path.resolve(root, file)), `${item.name} should emit ${file}`).toBe(true)
    }
    for (const pageFile of item.textFiles ?? []) {
      await expectUsingComponentsExist(item.name, root, item.outputDir, pageFile)
    }

    const styles = await readTextTargets(root, item.styleFiles ?? [item.outputDir], styleFileRE)
    expect(styles.length, `${item.name} should emit readable styles`).toBeGreaterThan(0)
    expect(styles, `${item.name} styles should not contain raw Tailwind directives`).not.toMatch(rawTailwindDirectiveRE)

    const texts = await readTextTargets(root, item.textFiles ?? [], textFileRE)
    const combined = `${styles}\n${texts}`
    const transformedClassMarkerRE = /_b[\w-]+_B/
    if (item.expectTransformedClassMarkers === false) {
      expect(combined, `${item.name} output should keep web selectors instead of mini-program class markers`).not.toMatch(transformedClassMarkerRE)
    }
    else {
      expect(combined, `${item.name} output should include transformed Tailwind arbitrary class markers`).toMatch(transformedClassMarkerRE)
    }
  }, 1_200_000)
})
