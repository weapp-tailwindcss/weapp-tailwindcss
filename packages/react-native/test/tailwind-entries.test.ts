import type { TailwindV4GenerateOptions, TailwindV4ResolvedSource } from '../../engine/src/v4/types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNativeStyleRuntime } from '../src/runtime'
import { generateNativeStylesheetEvidence } from '../src/tailwind/generate'

// 此专项复用真实 Tailwind engine；web target 的外层平台转换不参与入口隔离。
vi.mock('weapp-tailwindcss/generator', async () => {
  const engine = await import('../../engine/src/v4')
  return {
    resolveTailwindV4Source: engine.resolveTailwindV4Source,
    createWeappTailwindcssGenerator(source: TailwindV4ResolvedSource) {
      const generator = engine.createTailwindV4Engine(source)
      return { ...generator, generate: async (options: TailwindV4GenerateOptions) => {
        const result = await generator.generate(options)
        return { ...result, rawCss: result.css }
      } }
    },
  }
})

const require = createRequire(import.meta.url)
const tailwindImport = (name: string, options = '') => `@import ${JSON.stringify(require.resolve(`tailwindcss/${name}`).replaceAll('\\', '/'))} ${options};`
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'native-tailwind-entries-'))
  directories.push(projectRoot)
  await mkdir(path.join(projectRoot, 'styles'))
  return projectRoot
}

describe('原生 Tailwind 独立 CSS 入口', () => {
  it('Metro 未传 candidates 时仍编码实际 CSS 中的 apply 和 reference 自定义类', async () => {
    const projectRoot = await fixture()
    await writeFile(path.join(projectRoot, 'styles', 'reference.css'), `@reference ${JSON.stringify(require.resolve('tailwindcss/index.css').replaceAll('\\', '/'))}; .referenced { @apply p-[16px]; }`)
    await writeFile(path.join(projectRoot, 'global.css'), `${tailwindImport('index.css', 'source(none)')} @import './styles/reference.css'; .applied { @apply flex items-center; }`)
    await writeFile(path.join(projectRoot, 'App.tsx'), '<View className="ios:applied android:referenced native:unemitted" />')
    const result = await generateNativeStylesheetEvidence({ projectRoot, cssEntries: ['global.css'], sourceGlobs: ['./App.tsx'] })
    const runtime = createNativeStyleRuntime(result.manifest)
    expect(result.generatedClassSet).not.toContain('applied')
    expect(result.generatedClassSet).not.toContain('referenced')
    expect(runtime.tw('applied')).toEqual({ display: 'flex', alignItems: 'center' })
    expect(runtime.tw('referenced')).toEqual({ paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 })
    expect(runtime.tw('unemitted')).toEqual({})
    expect(runtime.tw('ios:applied', { platform: 'ios' })).toEqual({ display: 'flex', alignItems: 'center' })
    expect(runtime.tw('ios:applied', { platform: 'android' })).toEqual({})
    expect(runtime.tw('android:referenced', { platform: 'android' })).toEqual({ paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 })
    expect(runtime.tw('native:unemitted', { platform: 'ios' })).toEqual({})
    expect(result.manifest.staticLookup?.applied).toHaveLength(1)
    expect(result.manifest.staticLookup?.referenced).toHaveLength(1)
  })

  it('真实 Tailwind 双轴 skew 保留全部变量组成的 transform', async () => {
    const projectRoot = await fixture()
    const result = await generateNativeStylesheetEvidence({ projectRoot, css: tailwindImport('index.css'), candidates: ['skew-x-6', 'skew-y-3'], sourceGlobs: [] })
    expect(createNativeStyleRuntime(result.manifest).tw('skew-x-6 skew-y-3')).toEqual({ transform: [{ skewX: '6deg' }, { skewY: '3deg' }] })
    expect(result.manifest.warnings).toEqual([])
  })

  it('透传宿主 boxShadow 能力边界，并完整保留真实 Tailwind 双层阴影', async () => {
    const projectRoot = await fixture()
    const options = { projectRoot, css: tailwindImport('index.css'), candidates: ['shadow-lg', 'ring-2', 'inset-shadow-sm'], sourceGlobs: [] }
    const result = await generateNativeStylesheetEvidence(options)
    const layers = result.manifest.rules['shadow-lg']?.[0]?.style.boxShadow as Record<string, unknown>[]
    expect(layers.slice(-2)).toEqual([
      { offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color: 'rgba(0, 0, 0, 0.1)' },
      { offsetX: 0, offsetY: 4, blurRadius: 6, spreadDistance: -4, color: 'rgba(0, 0, 0, 0.1)' },
    ])
    const disabled = await generateNativeStylesheetEvidence({ ...options, boxShadow: false })
    expect(disabled.manifest.rules['shadow-lg']?.[0]?.style).not.toHaveProperty('boxShadow')
    expect(disabled.manifest.warnings).toContainEqual(expect.objectContaining({ className: 'shadow-lg', property: 'boxShadow', message: expect.stringContaining('宿主') }))
  })

  it('真实 Tailwind 阴影颜色、透明度、ring 与 inset modifier 使用同一变量级联', async () => {
    const projectRoot = await fixture()
    const result = await generateNativeStylesheetEvidence({
      projectRoot,
      css: `${tailwindImport('index.css')} @theme { --color-brand: #123456; }`,
      candidates: ['shadow-lg', 'shadow-brand', 'shadow-brand/50', 'ring-2', 'ring-brand', 'inset-shadow-sm', 'inset-shadow-brand'],
      sourceGlobs: [],
    })
    const runtime = createNativeStyleRuntime(result.manifest)
    const layers = (classes: string) => (runtime.tw(classes) as { boxShadow: Record<string, unknown>[] }).boxShadow
    expect(layers('shadow-lg shadow-brand/50').map(item => item.color)).toEqual(['rgba(18, 52, 86, 0.5)', 'rgba(18, 52, 86, 0.5)'])
    expect(layers('shadow-lg shadow-brand ring-2 ring-brand inset-shadow-sm inset-shadow-brand')).toEqual([
      { offsetX: 0, offsetY: 2, blurRadius: 4, spreadDistance: 0, color: '#123456', inset: true },
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: '#123456' },
      { offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color: '#123456' },
      { offsetX: 0, offsetY: 4, blurRadius: 6, spreadDistance: -4, color: '#123456' },
    ])
    expect(result.manifest.warnings).toEqual([])
  })

  it('普通 reference/apply 与 prefix 入口独立生成，前缀不能泄漏', async () => {
    const projectRoot = await fixture()
    await writeFile(path.join(projectRoot, 'styles', 'reference.css'), `@reference ${JSON.stringify(require.resolve('tailwindcss/index.css').replaceAll('\\', '/'))}; .reference { @apply p-[16px]; }`)
    await writeFile(path.join(projectRoot, 'global.css'), `${tailwindImport('index.css')} @import './styles/reference.css'; @theme { --color-brand: #123456; }`)
    await writeFile(path.join(projectRoot, 'styles', 'prefix.css'), `${tailwindImport('theme.css', 'layer(theme) prefix(tw)')} ${tailwindImport('utilities.css', 'layer(utilities) source(none) prefix(tw)')} @theme { --color-brand: #654321; }`)
    const result = await generateNativeStylesheetEvidence({ projectRoot, cssEntries: ['global.css', path.join('styles', 'prefix.css')], candidates: ['bg-brand', 'tw:bg-brand', 'reference'], sourceGlobs: [] })
    expect(result.manifest.rules['bg-brand']?.[0]?.style).toEqual({ backgroundColor: '#123456' })
    expect(result.rawCss).toContain('.tw\\:bg-brand')
    expect(result.rawCss).toContain('#654321')
    expect(result.manifest.rules['tw:bg-brand']).toBeUndefined()
    expect(result.manifest.rules.reference?.[0]?.style).toEqual({ paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 })
    expect(result.generatedClassSet).toEqual(expect.arrayContaining(['bg-brand', 'tw:bg-brand']))
    expect(result.manifest.warnings).toEqual([expect.objectContaining({ className: 'tw:bg-brand', property: 'variant' })])
  })

  it('分别编码来源变量，再按入口顺序合并同名 class 的级联', async () => {
    const projectRoot = await fixture()
    await writeFile(path.join(projectRoot, 'a.css'), ':root { --brand: #123456; } .from-a { color: var(--brand); } .shared { width: 11px; }')
    await writeFile(path.join(projectRoot, 'b.css'), ':root { --brand: #654321; } .from-b { color: var(--brand); } .shared { width: 13px; }')
    const result = await generateNativeStylesheetEvidence({ projectRoot, cssEntries: ['a.css', 'b.css'], candidates: ['from-a', 'from-b', 'shared'], sourceGlobs: [] })
    const runtime = createNativeStyleRuntime(result.manifest)
    expect(runtime.tw('from-a')).toEqual({ color: '#123456' })
    expect(runtime.tw('from-b')).toEqual({ color: '#654321' })
    expect(runtime.tw('shared')).toEqual({ width: 13 })
    const ids = result.manifest.staticLookup?.shared ?? []
    expect(new Set(ids).size).toBe(ids.length)
    expect(runtime.getStaticStyle(ids)).toEqual({ width: 13 })
    expect(result.manifest.rules.shared).toHaveLength(2)
  })

  it('文件入口与不同 base 的内存入口拥有独立主题', async () => {
    const projectRoot = await fixture()
    await writeFile(path.join(projectRoot, 'a.css'), ':root { --brand: #123456; } .from-a { color: var(--brand); }')
    const result = await generateNativeStylesheetEvidence({
      projectRoot,
      cssEntries: ['a.css'],
      candidates: ['from-a', 'from-b'],
      sourceGlobs: [],
      cssSources: [{ file: path.join('styles', 'virtual.css'), css: ':root { --brand: #654321; } .from-b { color: var(--brand); }' }],
    })
    expect(createNativeStyleRuntime(result.manifest).tw('from-a from-b')).toEqual({ color: '#654321' })
    expect(result.manifest.rules['from-a']?.[0]?.style).toEqual({ color: '#123456' })
  })

  it('只能遍历一次的候选也覆盖全部入口', async () => {
    const projectRoot = await fixture()
    function* candidates() {
      yield 'from-a'
      yield 'from-b'
    }
    const result = await generateNativeStylesheetEvidence({
      projectRoot,
      candidates: candidates(),
      sourceGlobs: [],
      cssSources: [{ css: '.from-a { width: 11px; }' }, { css: '.from-b { height: 13px; }' }],
    })
    expect(result.manifest.rules['from-a']?.[0]?.style).toEqual({ width: 11 })
    expect(result.manifest.rules['from-b']?.[0]?.style).toEqual({ height: 13 })
  })
})
