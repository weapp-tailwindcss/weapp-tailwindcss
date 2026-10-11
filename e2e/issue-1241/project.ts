import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import { execa } from 'execa'
import { createWatchProcessEnv } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/environment'
import { resolveStylesheetImport } from './stylesheet-path'
import { dependencies, save } from './support'

export interface Options {
  wechatAppId?: string
  spacing?: string
  calc?: 'nested' | 'top' | 'boolean' | 'off' | 'default'
  inline?: boolean
  extra?: string
  author?: string
  secondTheme?: string
  preserveDeletedCss?: boolean
}

export const multipliers: Record<string, number> = {
  '.w-32': 32,
  '.h-32': 32,
  '.p-4': 4,
  '.mt-4': 4,
  '.gap-4': 4,
  '.-mt-4': -4,
  '.p-0_d5': 0.5,
  '.-mt-0_d5': -0.5,
}
export const classes = 'w-32 h-32 p-4 mt-4 gap-4 -mt-4 p-0.5 -mt-0.5'
export const properties: Record<string, string> = {
  '.w-32': 'width',
  '.h-32': 'height',
  '.p-4': 'padding',
  '.mt-4': 'margin-top',
  '.gap-4': 'gap',
  '.-mt-4': 'margin-top',
  '.p-0_d5': 'padding',
  '.-mt-0_d5': 'margin-top',
}
export function pageSource(marker: string, candidates = classes) {
  return `<template><view class="scope ${candidates}">${marker}</view></template>\n`
}
export function themeSource(options: Options = {}) {
  return `@import 'tailwindcss' source(none);\n@source './pages/index.vue';\n@theme${options.inline ? ' inline' : ''} { --spacing: ${options.spacing ?? '1rpx'}; }\n${options.extra ?? ''}\n`
}

export async function createProject(name: string, options: Options = {}) {
  const seed = await dependencies()
  const version = 'workspace'
  const parent = seed.temporary
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(path.join(parent, `${name}-`))
  await mkdir(path.join(root, 'src', 'pages'), { recursive: true })
  const modules = path.join(root, 'node_modules')
  await mkdir(modules)
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  for (const entry of await readdir(path.join(seed.root, 'node_modules'))) {
    if (entry.startsWith('.') || entry === 'weapp-tailwindcss') {
      continue
    }
    await symlink(path.join(seed.root, 'node_modules', entry), path.join(modules, entry), linkType)
  }
  await symlink(seed.packageRoot, path.join(modules, 'weapp-tailwindcss'), linkType)
  const manifest = JSON.parse(await readFile(path.join(seed.root, 'package.json'), 'utf8'))
  // 沿用 Issue 的非 type:module 工程；旧 uni 插件经 Vite 的 CJS 互操作加载。
  delete manifest.type
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2))
  const calc = options.calc ?? 'default'
  const config = calc === 'top'
    ? 'cssCalc: [\'--spacing\'],'
    : calc === 'boolean'
      ? 'cssOptions: { cssCalc: true },'
      : calc === 'off'
        ? 'cssOptions: { cssCalc: false },'
        : calc === 'default' ? '' : 'cssOptions: { cssCalc: [\'--spacing\'] },'
  const main = `import { createSSRApp } from 'vue'\nimport App from './App.vue'\nimport './tailwind.css'\n${options.author ? 'import \'./author.css\'\n' : ''}${options.secondTheme ? 'import \'./second.css\'\n' : ''}export function createApp(){return {app:createSSRApp(App)}}\n`
  const files = {
    'vite.config.ts': `import {defineConfig} from 'vite'; import uni from '@dcloudio/vite-plugin-uni'; import {WeappTailwindcss} from 'weapp-tailwindcss/vite'; export default defineConfig({plugins:[uni(),WeappTailwindcss({cssEntries:[${options.secondTheme ? '\'./src/tailwind.css\',\'./src/second.css\'' : '\'./src/tailwind.css\''}],rem2rpx:true,${options.preserveDeletedCss === false ? 'generator:{hmr:{preserveDeletedCss:false}},' : ''}${config}})],css:{postcss:{plugins:[]}}});\n`,
    'src/main.ts': main,
    'src/App.vue': '<script>export default {}</script>',
    'src/pages.json': JSON.stringify({ pages: [{ path: 'pages/index' }] }),
    'src/manifest.json': JSON.stringify({ 'name': 'published-issues', 'appid': '', 'versionName': '1.0.0', 'mp-weixin': { appid: options.wechatAppId ?? 'touristappid', setting: { urlCheck: false } } }),
    'src/tailwind.css': themeSource(options),
    'src/pages/index.vue': pageSource(name),
    ...(options.author ? { 'src/author.css': options.author } : {}),
    ...(options.secondTheme ? { 'src/second.css': themeSource({ spacing: options.secondTheme }) } : {}),
  }
  for (const [name, source] of Object.entries(files)) {
    await writeFile(path.join(root, name), source)
  }
  const output = path.join(root, 'dist')
  const compilerManifest = seed.require.resolve('@dcloudio/vite-plugin-uni/package.json')
  const compiler = JSON.parse(await readFile(compilerManifest, 'utf8'))
  const uniBin = path.resolve(path.dirname(compilerManifest), compiler.bin.uni)
  const fixtureRequire = createRequire(path.join(root, 'package.json'))
  const resolvedPlugin = await realpath(fixtureRequire.resolve('weapp-tailwindcss/vite'))
  assert(!path.relative(seed.packageRoot, resolvedPlugin).startsWith('..'), resolvedPlugin)
  await save(`${version}/${name}/project.json`, { root, output, resolvedPlugin, uniBin, options })
  return {
    root,
    output,
    version,
    name,
    main,
    uniBin,
    themeFile: path.join(root, 'src', 'tailwind.css'),
    pageFile: path.join(root, 'src', 'pages', 'index.vue'),
    env: createWatchProcessEnv(process.env, {
      UNI_PLATFORM: 'mp-weixin',
      UNI_INPUT_DIR: path.join(root, 'src'),
      UNI_OUTPUT_DIR: output,
      NODE_ENV: 'production',
    }),
  }
}
export type Project = Awaited<ReturnType<typeof createProject>>

export async function build(project: Project, phase = 'build', output = project.output) {
  const result = await execa(process.execPath, [project.uniBin, 'build', '-p', 'mp-weixin'], {
    cwd: project.root,
    env: { ...project.env, UNI_OUTPUT_DIR: output },
    timeout: 120_000,
    reject: false,
  })
  await save(`${project.version}/${project.name}/${phase}.log`, `${result.stdout}\n${result.stderr}`)
  assert.equal(result.exitCode, 0, result.stdout + result.stderr)
}

export async function readOutput(project: Project, output = project.output) {
  const files = (await readdir(output, { recursive: true })).filter(name => name.endsWith('.wxss')).sort()
  const sheets = await Promise.all(files.map(async name => ({ name, css: await readFile(path.join(output, name), 'utf8') })))
  const wxml = await readFile(path.join(output, 'pages', 'index.wxml'), 'utf8')
  const byFile = new Map(sheets.map(sheet => [path.resolve(output, sheet.name), sheet]))
  const reachable = new Set<string>()
  const visit = (file: string) => {
    if (reachable.has(file)) {
      return
    }
    const sheet = byFile.get(file)
    assert(sheet, `样式引用不存在：${file}`)
    reachable.add(file)
    postcss.parse(sheet.css).walkAtRules('import', (rule: any) => {
      const match = rule.params.match(/^(?:url\(\s*)?["']([^"']+)["']/)
      assert(match, `无法解析本轮样式导入：${rule.params}`)
      visit(resolveStylesheetImport(output, file, match[1]))
    })
  }
  visit(path.join(output, 'app.wxss'))
  const pageStyle = path.join(output, 'pages', 'index.wxss')
  if (byFile.has(pageStyle)) {
    visit(pageStyle)
  }
  // watch 可能遗留不再被入口引用的旧文件；必须按页面实际样式图验收。
  const activeSheets = sheets.filter(sheet => reachable.has(path.resolve(output, sheet.name)))
  const css = activeSheets.map(sheet => sheet.css).join('\n')
  const declarations: Record<string, string[]> = {}
  postcss.parse(css).walkRules((rule: any) => {
    for (const selector of rule.selectors) {
      if (!properties[selector]) {
        continue
      }
      rule.walkDecls(properties[selector], (decl: any) => {
        (declarations[selector] ??= []).push(decl.value.replace(/\s+/g, ''))
      })
    }
  })
  return { css, wxml, declarations, sheets, activeStylesheets: activeSheets.map(sheet => sheet.name) }
}

export async function evidence(project: Project, phase = 'output') {
  const output = await readOutput(project)
  await save(`${project.version}/${project.name}/${phase}.json`, output)
  return output
}
