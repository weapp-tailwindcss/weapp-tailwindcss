import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'
import { authoringFixtures } from '../tools/tailwindcss-test-catalog/src/authoring'
import { cssDeclarations, retainsDeclarations } from './tailwind-capabilities/css'
import { withGeneratorFixture } from './tailwind-capabilities/fixture'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const fixture = authoringFixtures.find(item => item.id === 'reference')!
const expected = fixture.expectedDeclarations[0]!

async function officialReference() {
  const directory = path.join(root, 'e2e', 'fixtures', 'isolated-reference')
  // 官方编译器只读取声明好的独立输入，不消费产品输出或判定结果。
  const compiler = await compile(fixture.css, {
    base: directory,
    loadStylesheet: async (id, base) => {
      const file = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : path.resolve(base, id)
      const key = path.relative(directory, file)
      return { path: file, base: path.dirname(file), content: fixture.files[key] ?? await readFile(file, 'utf8') }
    },
  })
  return compiler.build([])
}

describe('@reference 的独立官方生成预期', () => {
  it('官方编译器为只引用的主题变量保留具体fallback，清单必须精确声明', async () => {
    const css = await officialReference()
    const declarations = cssDeclarations(css).bySelector.get(expected.selector!)!
    expect(declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'padding', value: '17px' }),
      expect.objectContaining({ property: 'background-color', value: 'var(--color-catalog-brand, #123456)' }),
    ]))
    expect(retainsDeclarations(declarations, expected.declarations)).toBe(true)
  })

  it('产品输出同时匹配官方输出与预先声明的fallback', async () => {
    const official = cssDeclarations(await officialReference()).bySelector.get(expected.selector!)!
    await withGeneratorFixture(root, fixture.css, fixture.files, async (generator) => {
      const generated = await generator.generate({ target: 'web', candidates: fixture.candidates, scanSources: false })
      const actual = cssDeclarations(generated.rawCss).bySelector.get(expected.selector!)!
      expect(retainsDeclarations(actual, official)).toBe(true)
      expect(retainsDeclarations(actual, expected.declarations)).toBe(true)
    })
  })

  it.each([
    ['缺少fallback', 'var(--color-catalog-brand)'],
    ['错误fallback', 'var(--color-catalog-brand, #654321)'],
    ['错误主题变量', 'var(--color-other-brand, #123456)'],
  ])('%s不能被归一化后错误放行', (_name, value) => {
    const declarations = cssDeclarations(`.catalog-reference{padding:17px;background-color:${value}}`).bySelector.get('.catalog-reference')!
    expect(retainsDeclarations(declarations, expected.declarations)).toBe(false)
  })
})
