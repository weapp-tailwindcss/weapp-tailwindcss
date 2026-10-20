import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { createPresetEnvPlugin } from '@/plugins/preset-env'

async function declarations(property: string, value: string, preserve = true) {
  const result = await postcss([createPresetEnvPlugin({ stage: false, features: { 'place-properties': { preserve } }, autoprefixer: { add: false, remove: false } })])
    .process(`@media print{.probe{${property}:${value}!important}}`, { from: undefined })
  const observed: Array<[string, string, boolean]> = []
  result.root.walkDecls((declaration) => {
    observed.push([declaration.prop, declaration.value, Boolean(declaration.important)])
  })
  expect(result.root.first).toMatchObject({ name: 'media', params: 'print' })
  return observed
}

describe('place 简写按 CSS Alignment 值组展开', () => {
  it.each(['content', 'items', 'self'])('%s 保留 overflow-position 和 baseline-position 值组', async (kind) => {
    for (const value of ['safe center', 'unsafe end', 'first baseline', 'last baseline', 'baseline']) {
      const justify = kind === 'content' && value.endsWith('baseline') ? 'start' : value
      expect(await declarations(`place-${kind}`, value)).toEqual([
        [`align-${kind}`, value, true],
        [`justify-${kind}`, justify, true],
        [`place-${kind}`, value, true],
      ])
    }
  })

  it.each([
    ['content', 'safe center unsafe end', 'safe center', 'unsafe end'],
    ['content', 'first baseline safe end', 'first baseline', 'safe end'],
    ['items', 'last baseline safe center', 'last baseline', 'safe center'],
    ['items', 'center legacy right', 'center', 'legacy right'],
    ['items', 'center right legacy', 'center', 'right legacy'],
    ['self', 'safe self-start unsafe flex-end', 'safe self-start', 'unsafe flex-end'],
    ['self', 'auto center', 'auto', 'center'],
    ['content', 'space-between center', 'space-between', 'center'],
  ])('%s 的两个完整值组 %s 分别展开', async (kind, value, align, justify) => {
    expect(await declarations(`place-${kind}`, value, false)).toEqual([
      [`align-${kind}`, align, true],
      [`justify-${kind}`, justify, true],
    ])
  })

  it.each(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])('CSS-wide %s 同时赋给两个方向', async (value) => {
    expect(await declarations('place-self', value, false)).toEqual([
      ['align-self', value, true],
      ['justify-self', value, true],
    ])
  })

  it.each(['var(--alignment)', 'safe var(--position)', 'safe', 'safe baseline', 'center end extra', 'center inherit', 'auto', 'unknown'])('无法静态解析的 %s 不产生错误长写，即使 preserve=false 也保留原声明', async (value) => {
    expect(await declarations('place-items', value, false)).toEqual([['place-items', value, true]])
  })

  it('精确匹配属性且保留大小写和注释输入的语义', async () => {
    expect(await declarations('place-items-extra', 'safe center')).toEqual([['place-items-extra', 'safe center', true]])
    expect(await declarations('PLACE-SELF', 'SAFE/**/CENTER', false)).toEqual([
      ['align-self', 'safe center', true],
      ['justify-self', 'safe center', true],
    ])
  })

  it('沿用全局 preserve 与显式 feature 关闭设置', async () => {
    const css = '.probe{place-items:safe center}'
    const disabled = await postcss([createPresetEnvPlugin({ stage: false, features: { 'place-properties': false }, autoprefixer: { add: false, remove: false } })]).process(css, { from: undefined })
    expect(disabled.css).toBe(css)
    const replaced = await postcss([createPresetEnvPlugin({ stage: false, preserve: false, features: { 'place-properties': true }, autoprefixer: { add: false, remove: false } })]).process(css, { from: undefined })
    expect(replaced.css).toBe('.probe{align-items:safe center;justify-items:safe center}')
  })

  it('功能元组的 preserve 优先于全局值', async () => {
    const result = await postcss([createPresetEnvPlugin({ stage: false, preserve: true, features: { 'place-properties': [true, { preserve: false }] }, autoprefixer: { add: false, remove: false } })])
      .process('.probe{place-self:safe center}', { from: undefined })
    expect(result.css).toBe('.probe{align-self:safe center;justify-self:safe center}')
  })
})
