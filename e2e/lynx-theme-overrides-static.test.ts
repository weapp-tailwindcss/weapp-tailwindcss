import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { parseGeneratedRules } from './lynx/static-evidence'
import { assertThemeOverrideRules } from './lynx/theme-overrides-static'

async function rules(root = ':root, :host') {
  const fixture = await fs.readFile(path.join(import.meta.dirname, '..', 'examples', 'react-lynx', 'src', 'styles', 'theme-overrides-fixtures.css'), 'utf8')
  return parseGeneratedRules(`${root}{--color-brand:#f00}${fixture}.bg-brand{background-color:var(--color-brand)}`)
}

it('生成层允许纯全局根组，编码层必须独立保留根定义', async () => {
  const generated = await rules()
  expect(() => assertThemeOverrideRules(generated, 'generation')).not.toThrow()
  expect(() => assertThemeOverrideRules(generated, 'encoding')).toThrow(/主题覆盖/)
  const encoded = await rules(':root')
  expect(() => assertThemeOverrideRules(encoded, 'encoding')).not.toThrow()
})

it.each(['.theme-evidence-panel', ':host', ':root, .panel', ':root, :host, .panel'])('拒绝 %s 给初始主题提供局部或无效兜底', async (selector) => {
  const generated = await rules(selector)
  expect(() => assertThemeOverrideRules(generated, 'generation')).toThrow(/主题覆盖/)
})

it('真实主题夹具的 Tailwind 初始 token 必须来自生成器，不能手写重复根定义', async () => {
  const fixture = await fs.readFile(path.join(import.meta.dirname, '..', 'examples', 'react-lynx', 'src', 'styles', 'theme-overrides-fixtures.css'), 'utf8')
  expect(parseGeneratedRules(fixture).filter(rule => rule.selector !== '.theme-dark').flatMap(rule => rule.declarations).some(declaration => declaration.property === '--color-brand')).toBe(false)
})

it.each(['generation', 'encoding'] as const)('%s 缺少初始 Tailwind token 时，覆盖类和 utility 都存在也拒绝', async (stage) => {
  const generated = (await rules(':root')).map(rule => rule.selector === ':root' ? { ...rule, declarations: rule.declarations.filter(item => item.property !== '--color-brand') } : rule)
  expect(() => assertThemeOverrideRules(generated, stage)).toThrow(/:root\/--color-brand/)
})

it.each(['oklch(63% 0.2 40)', 'oklch(63% .2 40)', 'oklch(63%0.2 40)', 'oklch(63%.2 40)', 'oklch(0.63 0.2 40)', 'oklch(.63 .2 40)'])('按语义核对真实产物的颜色数字写法：%s', async (value) => {
  // 直接保留 CI 的原始声明，避免测试解析器预先缩短数字掩盖差异。
  const generated = (await rules(':root')).map(rule => rule.selector === ':root'
    ? { ...rule, declarations: rule.declarations.map(item => item.property === '--brand-color' ? { ...item, value } : item) }
    : rule)
  generated.push({ selector: ':root', declarations: [{ property: '--brand-color', value: 'rgb(230, 80, 0)', important: false }] })
  expect(() => assertThemeOverrideRules(generated, 'generation')).not.toThrow()
})

it.each(['oklch(64% .2 40)', 'oklch(63% .21 40)', 'oklch(63% .2 41)', 'oklch(63% .2 40 / .5)', 'oklch(63%0.240)'])('颜色或语法改变仍须拒绝：%s', async (value) => {
  const generated = (await rules(':root')).map(rule => rule.selector === ':root'
    ? { ...rule, declarations: rule.declarations.map(item => item.property === '--brand-color' ? { ...item, value } : item) }
    : rule)
  expect(() => assertThemeOverrideRules(generated, 'generation')).toThrow(/:root\/--brand-color/)
})
