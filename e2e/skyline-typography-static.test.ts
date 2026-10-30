import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postcss } from '@weapp-tailwindcss/postcss'
import { expect, it } from 'vitest'
import { ensureProjectBuilt } from './projectBuild'
import { getE2EProject } from './projectEntries'

it('uni-app Skyline 对照页与原始变量链的真实构建基线', async () => {
  const root = fileURLToPath(new URL('../demo/uni-app-vite-tailwindcss-v4', import.meta.url))
  const entry = getE2EProject('uni-app-vite-tailwindcss-v4')
  await ensureProjectBuilt(root, { env: entry.buildEnv })
  const output = path.join(root, 'dist', 'build', 'mp-weixin')
  const read = (name: string) => readFile(path.join(output, name), 'utf8')
  const app = JSON.parse(await read('app.json'))
  const project = JSON.parse(await read('project.config.json'))
  expect(app.componentFramework).toBe('glass-easel')
  expect(app.lazyCodeLoading).toBe('requiredComponents')
  expect(project.setting.skylineRenderEnable).toBe(true)
  const pages = []
  for (const renderer of ['webview', 'skyline']) {
    const route = `pages/skyline-typography/${renderer}`
    expect(app.pages).toContain(route)
    const config = JSON.parse(await read(`${route}.json`))
    expect(config.renderer).toBe(renderer)
    expect(config.navigationStyle).toBe('custom')
    const wxml = await read(`${route}.wxml`)
    expect(wxml).toContain('skyline-typography-probe')
    const css = await read(`${route}.wxss`)
    expect(css).toContain('.typography-page')
    pages.push({ route, config, wxml })
  }
  const componentWxml = await read('components/SkylineTypographyProbe.wxml')
  for (const id of ['probe-original', 'probe-utility', 'probe-reference', 'probe-child', 'probe-weight', 'probe-inline', 'probe-theme']) {
    expect(componentWxml).toContain(`id="${id}"`)
  }
  expect(await read('components/SkylineTypographyProbe.wxss')).toContain('.probe-weight')
  const stylesheets = (await readdir(output, { recursive: true }))
    .filter(name => name.endsWith('.wxss'))
    .sort()
  const rootCss = postcss.parse((await Promise.all(stylesheets.map(read))).join('\n'))
  const typography: Record<string, string> = {}
  rootCss.walkRules('.text-header-md', (rule) => {
    rule.walkDecls((decl) => {
      typography[decl.prop] = decl.value
    })
  })
  expect(typography['line-height']?.replace(/\s+/g, '')).toBe('var(--tw-leading,var(--text-header-md--line-height))')
  expect(typography['font-weight']?.replace(/\s+/g, '')).toBe('var(--tw-font-weight,var(--text-header-md--font-weight))')
  const resets: Record<string, string[]> = {}
  for (const prop of ['--tw-leading', '--tw-font-weight']) {
    const values: string[] = []
    rootCss.walkDecls(prop, (decl) => {
      values.push(decl.value)
    })
    resets[prop] = values
  }
  await expect(`${JSON.stringify({ pages, componentWxml, typography, resets }, null, 2)}\n`)
    .toMatchFileSnapshot('__snapshots__/skyline-typography/uni-app.json')
}, 150_000)
