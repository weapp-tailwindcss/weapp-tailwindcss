import * as cssTokenizer from '@csstools/css-tokenizer'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectRootScopedComparableCssCoverage, createRootCssCoverageSignatures } from '../src/compat/scoped-css/coverage'
import { createCoverageSignatures } from '../src/compat/scoped-css/signature'

vi.mock('@csstools/css-tokenizer', { spy: true })

describe('覆盖签名的 token 存储边界', () => {
  afterEach(() => vi.clearAllMocks())

  it('复用根值解析结果，但不让目标独有值进入长期复用的覆盖索引', () => {
    const tokenize = vi.mocked(cssTokenizer.tokenizer)
    const coverage = collectRootScopedComparableCssCoverage(['.a{color:red;display:flex}'])
    const target = createRootCssCoverageSignatures(coverage)
    tokenize.mockClear()
    const red = postcss.decl({ prop: 'color', value: 'red' })
    target.declaration(red)
    createRootCssCoverageSignatures(coverage).declaration(red)
    expect(tokenize).not.toHaveBeenCalled()
    const blue = postcss.decl({ prop: 'color', value: 'blue' })
    const blueKey = target.declaration(blue)
    expect(target.declaration(blue)).toBe(blueKey)
    expect(tokenize).toHaveBeenCalledTimes(1)
    expect(createRootCssCoverageSignatures(coverage).declaration(blue)).toBe(blueKey)
    expect(tokenize).toHaveBeenCalledTimes(2)
    expect(createRootCssCoverageSignatures({ ...coverage }).declaration(red)).toBe(target.declaration(red))
    expect(tokenize).toHaveBeenCalledTimes(3)
  })

  it('长 token 序列不重复存储完整类型名和嵌套元组', () => {
    const value = 'a '.repeat(2048)
    const signatures = createCoverageSignatures()
    const key = signatures.declaration(postcss.decl({ prop: '--tokens', value }))
    expect(key.length).toBeLessThan(value.length * 8)
    expect(signatures.declaration(postcss.decl({ prop: '--tokens', value: `${value}b` }))).not.toBe(key)
  })

  it('类型、字段边界、无效输入和编码标记不能产生相同身份', () => {
    const signatures = createCoverageSignatures()
    const values = [
      '',
      ' ',
      'a',
      'a b',
      'a/**/b',
      '1',
      '01',
      '"a"',
      '"a""b"',
      '"ab"',
      '"a:b"',
      '"a" b',
      '"vA1:a"',
      '"iA1:a"',
      '"A12:345678901234"',
      String.raw`"\0"`,
      String.raw`"\a"`,
      String.raw`"\\a"`,
      '"😀"',
      '"unterminated',
      '\'unterminated',
      'url(unterminated',
    ]
    const keys = values.map(value => signatures.declaration(postcss.decl({ prop: '--tokens', value })))
    expect(new Set(keys).size).toBe(values.length)
    expect(signatures.declaration(postcss.decl({ prop: '--other', value: values[2]! }))).not.toBe(keys[2])
    expect(signatures.declaration(postcss.decl({ prop: '--tokens', value: values[2]!, important: true }))).not.toBe(keys[2])
  })

  it('缓存只复用值，重挂节点或修改祖先后仍重新证明条件身份', () => {
    const signatures = createCoverageSignatures()
    const root = postcss.parse('@media print{.parent{.a{content:"AB"}}}@media screen{}')
    const print = root.first as postcss.AtRule
    const parent = print.first as postcss.Rule
    const child = parent.first as postcss.Rule
    const screen = root.last as postcss.AtRule
    const before = signatures.node(child)
    const selectorBefore = signatures.selector(child, child.selector)
    parent.selector = '.other'
    expect(signatures.node(child)).not.toBe(before)
    expect(signatures.selector(child, child.selector)).not.toBe(selectorBefore)
    const afterSelector = signatures.node(child)
    screen.append(parent)
    expect(signatures.node(child)).not.toBe(afterSelector)
    expect(signatures.node(child)).toBe(createCoverageSignatures().node(child))
    expect(signatures.node(postcss.atRule({ name: 'x', params: '' }))).not.toBe(signatures.node(postcss.atRule({ name: 'x', params: '', nodes: [] })))
  })
})
