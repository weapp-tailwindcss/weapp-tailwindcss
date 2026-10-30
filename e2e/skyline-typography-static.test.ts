import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postcss } from '@weapp-tailwindcss/postcss'
import { expect, it } from 'vitest'
import { ensureProjectBuilt } from './projectBuild'
import { getE2EProject } from './projectEntries'
import { typographyComponents } from './skyline-typography/contract'

it('uni-app Skyline 真实构建保留变量链并为各类组件输出本地初始化', async () => {
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
  for (const id of ['probe-original', 'probe-utility', 'probe-reference', 'probe-child', 'probe-child-small', 'probe-child-weight', 'probe-weight', 'probe-inline', 'probe-theme', 'probe-theme-variable', 'probe-author-empty']) {
    expect(componentWxml).toContain(`id="${id}"`)
  }
  expect(await read('components/SkylineTypographyProbe.wxss')).toContain('.probe-weight')
  expect(componentWxml).toMatch(/--tw-leading:\s*;/)
  const components = []
  for (const name of typographyComponents) {
    const source = await readFile(path.join(root, 'src', 'components', `${name}.vue`), 'utf8')
    const wxml = await read(path.join('components', `${name}.wxml`))
    const config = JSON.parse(await read(path.join('components', `${name}.json`)))
    expect(config.component).toBe(true)
    const css = postcss.parse(await read(path.join('components', `${name}.wxss`)))
    const localResets: { selector: string, declarations: Record<string, string> }[] = []
    css.walkRules((rule) => {
      const declarations: Record<string, string> = {}
      rule.walkDecls((decl) => {
        declarations[decl.prop] = decl.value.trim()
      })
      if (declarations['--tw-leading'] === 'var(--weapp-tw-invalid-reset)'
        && declarations['--tw-font-weight'] === 'var(--weapp-tw-invalid-reset)') {
        localResets.push({ selector: rule.selector, declarations })
      }
    })
    expect(localResets.length, `${name} 必须通过生产插件获得本地初始化`).toBeGreaterThan(0)
    if (name === 'SkylineTypographyNoStyle') {
      expect(source).not.toMatch(/<style(?:\s|>)/)
      expect(wxml).toContain('probe-no-style-header')
    }
    if (name === 'SkylineTypographyScoped') {
      expect(source).toContain('<style scoped>')
      expect(css.toString()).toContain('.scoped-fixture')
    }
    if (name === 'SkylineTypographyExternal') {
      expect(source).toContain('<style src=')
      expect(css.toString()).toContain('.external-fixture')
    }
    components.push({ name, config, wxml, localResets })
  }
  const stylesheets = (await readdir(output, { recursive: true }))
    .filter(name => name.endsWith('.wxss'))
    .sort()
  const rootCss = postcss.parse((await Promise.all(stylesheets.map(read))).join('\n'))
  const typography: Record<string, Record<string, string>> = {}
  for (const name of ['header-md', 'probe-small']) {
    const declarations: Record<string, string> = {}
    rootCss.walkRules(`.text-${name}`, (rule) => {
      rule.walkDecls((decl) => {
        declarations[decl.prop] = decl.value
      })
    })
    expect(declarations['line-height']?.replace(/\s+/g, '')).toBe(`var(--tw-leading,var(--text-${name}--line-height))`)
    expect(declarations['font-weight']?.replace(/\s+/g, '')).toBe(`var(--tw-font-weight,var(--text-${name}--font-weight))`)
    typography[name] = declarations
  }
  const resets: Record<string, string[]> = {}
  for (const prop of ['--tw-leading', '--tw-font-weight']) {
    const values: string[] = []
    rootCss.walkDecls(prop, (decl) => {
      values.push(decl.value)
    })
    resets[prop] = values
  }
  const reservedDefinitions: string[] = []
  rootCss.walkDecls('--weapp-tw-invalid-reset', (decl) => {
    reservedDefinitions.push(decl.toString())
  })
  expect(reservedDefinitions).toEqual([])
  await expect(`${JSON.stringify({ pages, componentWxml, components, typography, resets }, null, 2)}\n`)
    .toMatchFileSnapshot('__snapshots__/skyline-typography/uni-app.json')
}, 150_000)
