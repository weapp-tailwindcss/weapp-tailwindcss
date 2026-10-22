import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import postcss from 'postcss'
import { compile } from 'tailwindcss'
import cssVarsV4, { tailwindPropertyRegistrations } from '@/cssVarsV4'

const require = createRequire(import.meta.url)

it('默认兼容签名与当前实际 Tailwind 编译器的全部注册双向一致', async () => {
  const inventory = JSON.parse(await readFile(new URL('../../../e2e/tailwind-capabilities/inventory/tailwind-4.3.3.json', import.meta.url), 'utf8'))
  const metadata = JSON.parse(await readFile(require.resolve('tailwindcss/package.json'), 'utf8'))
  expect(metadata.version).toBe(inventory.tailwindcss)
  const theme = await readFile(require.resolve('tailwindcss/theme.css'), 'utf8')
  // 官方编译器仅作为隔离 oracle；产品生成入口仍由 engine 接管。
  const compiler = await compile(`@layer theme {${theme}} @tailwind utilities;`)
  const css = compiler.build(inventory.utilities.map((item: { witness: string }) => item.witness))
  const registrations: { prop: string, syntax: string, initialValue?: string }[] = []
  postcss.parse(css).walkAtRules('property', (rule) => {
    expect(rule.parent?.type).toBe('root')
    const descriptors = new Map(rule.nodes!.map(node => {
      expect(node.type).toBe('decl')
      const decl = node as postcss.Declaration
      return [decl.prop, decl.value]
    }))
    expect(descriptors.get('inherits')).toBe('false')
    registrations.push({
      prop: rule.params,
      syntax: JSON.parse(descriptors.get('syntax')!),
      initialValue: descriptors.get('initial-value'),
    })
  })
  expect(registrations).toHaveLength(127)
  expect(new Set(registrations.map(item => item.prop)).size).toBe(registrations.length)
  const byName = (a: { prop: string }, b: { prop: string }) => a.prop.localeCompare(b.prop)
  expect(registrations.sort(byName)).toEqual([...tailwindPropertyRegistrations].sort(byName))
})

it('注册签名与旧默认值分离，保留现有默认映射的对象形状和人工 initial', () => {
  expect(cssVarsV4).toHaveLength(127)
  expect(cssVarsV4.every(item => Object.keys(item).join(',') === 'prop,value')).toBe(true)
  for (const name of ['gradient-position', 'gradient-stops', 'gradient-via-stops', 'duration', 'ease', 'text-shadow-color', 'shadow-color', 'inset-shadow-color']) {
    expect(cssVarsV4.find(item => item.prop === `--tw-${name}`)?.value).toBe('initial')
    expect(tailwindPropertyRegistrations.find(item => item.prop === `--tw-${name}`)?.initialValue).toBeUndefined()
  }
})
