import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { createCoverageSignatures } from '../src/compat/scoped-css/signature'

describe('覆盖签名的操作生命周期', () => {
  it('保留重复字符串解码语义，并在容器、声明和条件变化后重新证明身份', () => {
    const signatures = createCoverageSignatures()
    const root = postcss.parse('@media print{.a{content:"AB"}.b{color:red}}')
    const media = root.first as postcss.AtRule
    const first = media.first as postcss.Rule
    const escaped = postcss.parse(String.raw`@media print{.a{content:'\41 B'}.b{color:red}}`).first as postcss.AtRule
    const initial = signatures.node(media)
    expect(signatures.node(escaped)).toBe(initial)
    first.remove()
    expect(signatures.node(media)).not.toBe(initial)
    const afterRemoval = signatures.node(media)
    const declaration = (media.first as postcss.Rule).first as postcss.Declaration
    declaration.value = 'blue'
    expect(signatures.node(media)).not.toBe(afterRemoval)
    const afterValueChange = signatures.node(media)
    media.params = 'screen'
    expect(signatures.node(media)).not.toBe(afterValueChange)
    expect(createCoverageSignatures().node(media)).toBe(signatures.node(media))
  })
})
