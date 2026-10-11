import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import { execa } from 'execa'
import fg from 'fast-glob'
import { createWatchProcessEnv } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/environment'
import { resolveProjectBin } from '../package-cli'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const demoRoot = path.join(repositoryRoot, 'demo/uni-app-vite-tailwindcss-v4')
const linkType = process.platform === 'win32' ? 'junction' : 'dir'

export interface FixtureOptions {
  wechatAppId?: string
  spacing?: string
  calc?: 'top-level' | 'nested' | 'off' | 'default'
  inline?: boolean
  overrides?: string
  authorCss?: string
}

export const initialClasses = 'w-32 h-32 p-4 mt-4 gap-4 -mt-4 p-0.5 -mt-0.5'

export function pageSource(classes = initialClasses, marker = 'initial') {
  return `<template><view class="scope ${classes}">issue-1214-${marker}</view></template>\n`
}

export function themeSource(options: FixtureOptions = {}) {
  return `@import 'tailwindcss' source(none);
@source './pages/index.vue';
@theme${options.inline ? ' inline' : ''} { --spacing: ${options.spacing ?? '1rpx'}; }
${options.overrides ?? ''}
`
}

export async function createProject(options: FixtureOptions = {}) {
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-issue-1214-')))
  const root = path.join(temporary, 'project')
  const close = () => rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  try {
    await mkdir(root)
    // 临时项目保留 workspace 的间接依赖查找层，实际包仍从当前 worktree 解析。
    await symlink(path.join(repositoryRoot, 'node_modules/.pnpm/node_modules'), path.join(temporary, 'node_modules'), linkType)
    const modules = path.join(root, 'node_modules')
    await mkdir(modules)
    for (const entry of await readdir(path.join(demoRoot, 'node_modules'), { withFileTypes: true })) {
      if (entry.name !== '@vue' && entry.name !== '.bin' && (entry.isDirectory() || entry.isSymbolicLink())) {
        await symlink(path.join(demoRoot, 'node_modules', entry.name), path.join(modules, entry.name), linkType)
      }
    }
    const demoRequire = createRequire(path.join(demoRoot, 'package.json'))
    const vueRequire = createRequire(demoRequire.resolve('vue/package.json'))
    const runtimeDom = vueRequire.resolve('@vue/runtime-dom/package.json')
    const runtimeRequire = createRequire(runtimeDom)
    await symlink(path.dirname(path.dirname(runtimeDom)), path.join(modules, '@vue'), linkType)
    const manifest = JSON.parse(await readFile(path.join(demoRoot, 'package.json'), 'utf8'))
    const calc = options.calc ?? 'default'
    const calcConfig = calc === 'top-level'
      ? 'cssCalc: [\'--spacing\'],'
      : calc === 'nested'
        ? 'cssOptions: { cssCalc: [\'--spacing\'] },'
        : calc === 'off' ? 'cssOptions: { cssCalc: false },' : ''
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ ...manifest, name: 'issue-1214', scripts: {} }),
      'vite.config.ts': `
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
export default defineConfig({
  plugins: [uni(), WeappTailwindcss({
    cssEntries: ['./src/tailwind.css'],
    rem2rpx: true,
    ${calcConfig}
  })],
  css: { postcss: { plugins: [] } },
  resolve: { alias: { '@vue/shared': ${JSON.stringify(runtimeRequire.resolve('@vue/shared/dist/shared.esm-bundler.js'))} } },
})
`,
      'src/main.ts': `
import { createSSRApp } from 'vue'
import App from './App.vue'
import './tailwind.css'
${options.authorCss ? 'import \'./author.css\'' : ''}
export function createApp() { return { app: createSSRApp(App) } }
`,
      'src/App.vue': '<script>export default {}</script>',
      'src/manifest.json': JSON.stringify({ 'name': 'issue-1214', 'appid': '', 'versionName': '1.0.0', 'mp-weixin': { appid: options.wechatAppId ?? 'touristappid' } }),
      'src/pages.json': JSON.stringify({ pages: [{ path: 'pages/index' }] }),
      'src/pages/index.vue': pageSource(),
      'src/tailwind.css': themeSource(options),
      ...(options.authorCss ? { 'src/author.css': options.authorCss } : {}),
    }
    for (const [name, content] of Object.entries(files)) {
      const file = path.resolve(root, name)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }
    const fixtureRequire = createRequire(path.join(root, 'package.json'))
    const resolvedPlugin = await realpath(fixtureRequire.resolve('weapp-tailwindcss/vite'))
    const localDist = await realpath(path.join(repositoryRoot, 'packages/weapp-tailwindcss/dist'))
    const relativePlugin = path.relative(localDist, resolvedPlugin)
    if (relativePlugin.startsWith(`..${path.sep}`) || path.isAbsolute(relativePlugin)) {
      throw new Error(`Issue #1214 必须消费当前 worktree 构建产物，实际解析为 ${resolvedPlugin}`)
    }
    const versions = Object.fromEntries(await Promise.all(['@dcloudio/vite-plugin-uni', 'tailwindcss', 'vite', 'vue'].map(async (name) => {
      const pkg = JSON.parse(await readFile(fixtureRequire.resolve(`${name}/package.json`), 'utf8'))
      return [name, pkg.version]
    })))
    return {
      root,
      uniBin: await resolveProjectBin(root, '@dcloudio/vite-plugin-uni', 'uni'),
      close,
      versions,
      output: path.join(root, 'dist'),
      pageFile: path.join(root, 'src/pages/index.vue'),
      themeFile: path.join(root, 'src/tailwind.css'),
      env: {
        UNI_PLATFORM: 'mp-weixin',
        UNI_INPUT_DIR: path.join(root, 'src'),
        UNI_OUTPUT_DIR: path.join(root, 'dist'),
      },
    }
  }
  catch (error) {
    await close()
    throw error
  }
}

export type Project = Awaited<ReturnType<typeof createProject>>

export async function buildProject(project: Project) {
  return execa(process.execPath, [project.uniBin, 'build', '-p', 'mp-weixin'], {
    cwd: project.root,
    env: createWatchProcessEnv(process.env, { ...project.env, NODE_ENV: 'production' }),
    timeout: 120_000,
  })
}

export async function readOutput(project: Project) {
  const files = await fg('**/*.wxss', { cwd: project.output, absolute: true })
  const css = (await Promise.all(files.sort().map(file => readFile(file, 'utf8')))).join('\n')
  const wxml = await readFile(path.join(project.output, 'pages/index.wxml'), 'utf8').catch(() => '')
  return { css, wxml }
}

export const probeProperties: Record<string, string> = {
  '.w-32': 'width',
  '.h-32': 'height',
  '.p-4': 'padding',
  '.mt-4': 'margin-top',
  '.gap-4': 'gap',
  '.-mt-4': 'margin-top',
  '.p-0_d5': 'padding',
  '.-mt-0_d5': 'margin-top',
}

export function readProbeDeclarations(css: string) {
  const declarations: Record<string, string[]> = {}
  postcss.parse(css).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const property = probeProperties[selector]
      if (!property) {
        continue
      }
      rule.walkDecls(property, (decl) => {
        // 保留所有声明及顺序，避免静态 fallback 被后续运行时 calc 覆盖而误通过。
        (declarations[selector] ??= []).push(decl.value.replace(/\s+/g, ''))
      })
    }
  })
  return declarations
}
