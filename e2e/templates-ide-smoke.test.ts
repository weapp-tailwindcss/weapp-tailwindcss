import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { captureMiniProgramScreenshot } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { resolveWechatAppId } from '../scripts/wechat-app-id'
import { installFrameworkIdeRuntimeErrorCollector } from './frameworkIdeRuntimeErrors'
import { clearProjectBuildState } from './projectTest'
import { readTemplatePageConfig, readTemplatePageConfigs } from './template-ide/config'
import { withTemplateAppId } from './template-ide/project-config'
import { assertTemplatePageRendered } from './template-ide/runtime'
import { withTemplateIdeSession } from './template-ide/session'

interface TemplateIdeCase {
  name: string
  template: string
  command: string[]
  projectPath: string
  miniprogramRoot: string
  appJson: string
  requiredFiles: string[]
}

interface TemplateIdeLocalOnlyCase {
  name: string
  reason: string
}

const repoRoot = path.resolve(__dirname, '..')
const templatesRoot = path.resolve(repoRoot, 'templates')
const launchTimeoutMs = Number(process.env['E2E_TEMPLATE_IDE_TIMEOUT_MS'] ?? process.env['E2E_AUTOMATOR_TIMEOUT_MS'] ?? 60_000)
const closeTimeoutMs = Number(process.env['E2E_TEMPLATE_IDE_CLOSE_TIMEOUT_MS'] ?? 5000)
const buildTimeoutMs = Number(process.env['E2E_TEMPLATE_IDE_BUILD_TIMEOUT_MS'] ?? 1_200_000)

const templateIdeCases: TemplateIdeCase[] = [
  {
    name: 'mpx-tailwindcss-v4 weixin',
    template: 'mpx-tailwindcss-v4',
    command: ['pnpm', 'run', 'build'],
    projectPath: 'dist/wx',
    miniprogramRoot: '.',
    appJson: 'app.json',
    requiredFiles: ['app.js', 'app.json', 'app.wxss', 'pages/index.wxml', 'project.config.json'],
  },
  ...[
    'taro-vite-tailwindcss-v4',
    'taro-webpack-tailwindcss-v4',
  ].map<TemplateIdeCase>(template => ({
    name: `${template} weapp`,
    template,
    command: ['pnpm', 'run', 'build:weapp'],
    projectPath: '.',
    miniprogramRoot: 'dist',
    appJson: 'dist/app.json',
    requiredFiles: ['project.config.json', 'dist/app.js', 'dist/app.json', 'dist/app.wxss', 'dist/pages/index/index.wxml'],
  })),
  ...[
    'uni-app-tailwindcss-v4',
    'uni-app-webpack-tailwindcss-v4',
  ].map<TemplateIdeCase>(template => ({
    name: `${template} mp-weixin`,
    template,
    command: ['pnpm', 'run', 'build:mp-weixin'],
    projectPath: 'dist/build/mp-weixin',
    miniprogramRoot: '.',
    appJson: 'app.json',
    requiredFiles: [
      'app.js',
      'app.json',
      'app.wxss',
      'pages/index/index.wxml',
      'project.config.json',
    ],
  })),
  {
    name: 'weapp-vite-tailwindcss-v4 weixin',
    template: 'weapp-vite-tailwindcss-v4',
    command: ['pnpm', 'run', 'build'],
    projectPath: '.',
    miniprogramRoot: 'dist',
    appJson: 'dist/app.json',
    requiredFiles: [
      'project.config.json',
      'dist/app.js',
      'dist/app.json',
      'dist/app.wxss',
      'dist/pages/index/index.wxml',
    ],
  },
]

const localOnlyIdeCases: TemplateIdeLocalOnlyCase[] = [
  {
    name: 'uni-app-hbuilderx-tailwindcss-v4',
    reason: '该模板没有可离线 CLI 构建脚本，需要在 HBuilderX 中导入后运行，不能用 WeChat DevTools automator 覆盖。',
  },
]

function getTemplateRoot(template: string) {
  return path.resolve(templatesRoot, template)
}

function shouldRunCase(name: string) {
  const filter = process.env['E2E_TEMPLATE_IDE_CASE'] ?? process.env['E2E_TEMPLATE_CASE']
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
    timeout: buildTimeoutMs,
  })
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

async function expectUsingComponentsExist(name: string, miniprogramRoot: string, pageJsonFile: string) {
  const pageConfig = await readTemplatePageConfig(pageJsonFile)
  for (const [componentName, componentPath] of Object.entries(pageConfig.usingComponents ?? {})) {
    const resolved = resolveComponentPath(miniprogramRoot, pageJsonFile, componentPath)
    if (!resolved) {
      continue
    }
    expect(await pathExists(`${resolved}.json`), `${name} usingComponents.${componentName} should emit ${resolved}.json`).toBe(true)
    expect(await pathExists(`${resolved}.wxml`), `${name} usingComponents.${componentName} should emit ${resolved}.wxml`).toBe(true)
  }
}

describe('templates ide smoke', () => {
  it('keeps non-WeChat-DevTools template IDE coverage documented', async () => {
    const covered = new Set([
      ...templateIdeCases.map(item => item.template),
      ...localOnlyIdeCases.map(item => item.name),
    ])
    const templateDirs = await fs.readdir(templatesRoot)
    for (const dir of templateDirs) {
      if (!await pathExists(path.resolve(templatesRoot, dir, 'package.json'))) {
        continue
      }
      expect(covered.has(dir), `${dir} should have IDE smoke coverage or a documented local-only reason`).toBe(true)
    }
    for (const item of localOnlyIdeCases) {
      expect(item.reason.length, `${item.name} should explain why IDE coverage is local-only`).toBeGreaterThan(0)
    }
  })

  it.each(templateIdeCases.filter(item => shouldRunCase(item.name)))('$name opens in WeChat DevTools automator', async (item) => {
    const root = getTemplateRoot(item.template)
    const projectPath = path.resolve(root, item.projectPath)
    const miniprogramRoot = path.resolve(projectPath, item.miniprogramRoot)

    if (process.env['E2E_TEMPLATE_IDE_SKIP_INSTALL'] !== '1') {
      await runPnpm(['install', '--frozen-lockfile'], root)
    }
    if (process.env['E2E_TEMPLATE_IDE_SKIP_BUILD'] !== '1') {
      await clearProjectBuildState(root)
      await runPnpm(item.command.slice(1), root)
    }

    for (const file of item.requiredFiles) {
      expect(await pathExists(path.resolve(projectPath, file)), `${item.name} should emit ${file}`).toBe(true)
    }

    const appConfig = await readJson<{ pages?: string[] }>(path.resolve(projectPath, item.appJson))
    const pagePath = appConfig.pages?.[0]
    expect(pagePath, `${item.name} should declare at least one page`).toBeTruthy()
    const pageUrl = `/${pagePath}`
    expect(await pathExists(path.resolve(miniprogramRoot, `${pagePath}.js`)), `${item.name} should emit page js`).toBe(true)
    const pageJsonFile = path.resolve(miniprogramRoot, `${pagePath}.json`)
    expect(await pathExists(path.resolve(miniprogramRoot, `${pagePath}.wxml`)), `${item.name} should emit page wxml`).toBe(true)
    await readTemplatePageConfigs(miniprogramRoot)
    await expectUsingComponentsExist(item.name, miniprogramRoot, pageJsonFile)

    const artifactDir = path.resolve(__dirname, '.artifacts/templates-ide', item.template)
    await fs.mkdir(artifactDir, { recursive: true })
    await withTemplateAppId(path.join(projectPath, 'project.config.json'), resolveWechatAppId(), () =>
      withTemplateIdeSession({
        projectPath,
        cliPath: process.env.E2E_PREFLIGHT_WECHAT_CLI,
        artifactDir,
        launchTimeoutMs,
        closeTimeoutMs,
      }, async (miniProgram) => {
        const errors = installFrameworkIdeRuntimeErrorCollector(item.name, miniProgram)
        const nodes = await assertTemplatePageRendered(miniProgram, pageUrl)
        await fs.writeFile(path.join(artifactDir, 'rendered.json'), JSON.stringify({ pageUrl, nodes }, null, 2))
        await captureMiniProgramScreenshot(miniProgram, path.join(artifactDir, 'rendered.png'), 15_000)
        await errors.assertNoErrors('template rendered')
      }))
  }, 240_000)
})
