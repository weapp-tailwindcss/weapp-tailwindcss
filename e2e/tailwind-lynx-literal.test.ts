import type { LynxEncoderDiagnostic, SerializedLynxRule } from './lynx/batch-encode'
import type { ReviewedConversionOracle } from './tailwind-capabilities/conversion-audit'
import { describe, expect, it } from 'vitest'
import { conversionCaseContract, conversionCaseResult } from './tailwind-capabilities/conversion-audit'
import { lynxLiteralOracles, reviewedLynxOracles } from './tailwind-capabilities/conversion-oracles/lynx'
import { lynxLiteralObservation } from './tailwind-capabilities/lynx/decoder-literal'
import { lynxRejectedDisplayValues } from './tailwind-capabilities/lynx/display-contract'

const candidate = { id: 'size-full', candidate: 'size-full', features: [] }
const reference = '.size-full{width:100%;height:100%}'
const oracle = reviewedLynxOracles(['size-full'], reference)[0]!
const complete = '.size-full { height: 100%; width: 100%; }'

function observe(css: string, diagnostics: LynxEncoderDiagnostic[] = [], rules: SerializedLynxRule[] = []) {
  return lynxLiteralObservation(candidate.candidate, { css, diagnostics, rules })
}

function result(css: string) {
  return conversionCaseResult(candidate, 'lynx', observe(css), [], oracle)
}

describe('Lynx decoder 字面子集与独立冻结 oracle', () => {
  it.each(lynxRejectedDisplayValues)('官方拒绝合同必须同时证明真实输入与无语义替换：%s', (value) => {
    const css = `.${value}{display:${value}}`
    const fixed = reviewedLynxOracles([value], css)[0]!
    const item = { id: value, candidate: value, features: [] }
    const output = { css: `.${value} { }`, sourceCss: css, encodedByteLength: 10, diagnostics: [], rules: [] }
    const check = (observed: typeof output) => conversionCaseResult(item, 'lynx', lynxLiteralObservation(value, observed), [], fixed)
    expect(fixed).toMatchObject({ support: 'unsupported', rejection: { documentation: 'https://lynxjs.org/api/css/properties/display.html' } })
    expect(check(output)).toMatchObject({ status: 'passed', support: 'unsupported' })
    expect(check({ ...output, css: `.${value}{display:flex}` }).status).toBe('failed')
    expect(check({ ...output, sourceCss: `.${value}{display:flex}` }).status).toBe('failed')
    expect(check({ ...output, sourceCss: '' }).status).toBe('failed')
    expect(check({ ...output, sourceCss: `${css}${css}` }).status).toBe('failed')
    expect(check({ ...output, sourceCss: `@media screen{${css}}` }).status).toBe('failed')
    expect(check({ ...output, encodedByteLength: 0 }).status).toBe('failed')
    expect(conversionCaseResult(item, 'lynx', lynxLiteralObservation(value, { css: '', diagnostics: [], rules: [] }), [], fixed).status).toBe('not-run')
    expect(reviewedLynxOracles([value], `.${value}{display:flex}`)).toEqual([])
    expect(() => conversionCaseContract(item, 'weapp', { ...fixed, target: 'weapp' })).toThrow('仅适用于')
    expect(() => conversionCaseContract(item, 'react-native', { ...fixed, target: 'react-native' })).toThrow('仅适用于')
    expect(() => conversionCaseContract(item, 'lynx', { ...fixed, rejection: undefined })).toThrow('实际诊断')
    expect(() => conversionCaseContract(item, 'lynx', { ...fixed, rejection: { ...fixed.rejection!, documentation: 'https://example.com' } } as ReviewedConversionOracle)).toThrow('仅适用于')
  })

  it('全部合同在目标执行前由明确表和官方参考登记', () => {
    const css = lynxLiteralOracles.map(item => `.${item.candidate}{${item.input.map(([property, value]) => `${property}:${value}`).join(';')}}`).join('')
    const oracles = reviewedLynxOracles(lynxLiteralOracles.map(item => item.candidate), css)
    expect(oracles).toHaveLength(lynxLiteralOracles.length)
    expect(oracles.every(item => item.support === 'supported' && item.expected.statements.length > 0)).toBe(true)
    expect(reviewedLynxOracles(['size-full'], '.size-full{width:90%;height:100%}')).toEqual([])
    expect(reviewedLynxOracles(['size-full'], '@media (min-width: 1px){.size-full{width:100%;height:100%}}')).toEqual([])
    expect(reviewedLynxOracles(['size-full'], '.size-full{width:100%;height:100%}.size-full{width:10%}')).toEqual([])
    expect(reviewedLynxOracles(['w-4'], '.w-4{width:1rem}')).toEqual([])
  })

  it('只接受实际输出的完整字面声明，空输出和部分声明必须失败', () => {
    expect(result(complete).status).toBe('passed')
    for (const css of ['', '.size-full { }', '.size-full { width: 100%; }', '.size-full { height: 100%; width: 90%; }']) {
      expect(result(css).status).toBe('failed')
    }
  })

  it('重复声明、重复规则和后续覆盖不会通过去重被隐藏', () => {
    for (const css of [
      '.size-full { height: 100%; width: 100%; width: 90%; }',
      `${complete}.size-full { width: 90%; }`,
      `${complete}${complete}`,
      '.size-full { height: 100%; width: 100% !important; }',
    ]) { expect(result(css).status).toBe('failed') }
  })

  it.each([
    `${complete}@media (min-width:1px){.size-full{width:90%}}`,
    `${complete}@layer utilities{@supports(display:flex){.size-full{width:90%}}}`,
    `${complete}.size-full:hover { width: 90%; }`,
    `${complete}.size-full,.other { width: 90%; }`,
    `${complete}.parent .size-full { width: 90%; }`,
    `${complete}.si\\7a e-full { width: 90%; }`,
    '.size-full { width: {{--size}}; height:100%; }',
    '.size-full { width:var(--size); height:100%; }',
    '.size-full { width:[100]; height:100%; }',
    `${complete}.broken {`,
    `unknown;${complete}`,
  ])('关联条件或未知展示格式保持未验证：%s', (css) => {
    expect(observe(css)).toMatchObject({ execution: 'completed', outputFormat: 'lynx-decoder-template' })
    expect(result(css).status).toBe('not-run')
  })

  it('不从无关字符串、变量和类名前缀推断本候选存在条件', () => {
    const output = `${complete}.size-full-other { width: 20px; }.other { content: ".size-full"; color: {{--color}}; }@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }`
    expect(result(output).status).toBe('passed')
    expect(lynxLiteralObservation('hover:flex', { css: '.hover:flex:hover { display:flex; }', diagnostics: [], rules: [] })).toMatchObject({ outputFormat: 'lynx-decoder-template' })
  })

  it('诊断仅按输入位置归属，输入属性和值不参与输出证明', () => {
    const rules: SerializedLynxRule[] = [
      { selectorText: { value: '.other', loc: { line: 2, column: 1 } }, style: [{ name: 'columns', keyLoc: { line: 2, column: 8 } }] },
      { selectorText: { value: '.size-full', loc: { line: 3, column: 1 } }, style: [{ name: 'width', keyLoc: { line: 3, column: 12 } }] },
    ]
    const diagnostic = { type: 'property', name: 'columns', line: 2, column: 8 }
    expect(observe(complete, [diagnostic], rules)).toMatchObject({ snapshot: { diagnostics: [] } })
    expect(observe(complete, [diagnostic], [{ ...rules[0], selectorText: { value: '.hover\\:flex:hover' } }])).toMatchObject({ snapshot: { diagnostics: [] } })
    expect(observe(complete, [diagnostic], [{ ...rules[0], selectorText: { value: '.size\\2d full' } }])).toMatchObject({ outputFormat: 'lynx-decoder-template' })
    expect(observe(complete, [{ type: 'property', name: 'width', line: 3, column: 12 }], rules)).toMatchObject({ snapshot: { diagnostics: ['property:width'] } })
    expect(conversionCaseResult(candidate, 'lynx', observe('', [], rules), [], oracle).status).toBe('failed')
    for (const diagnostics of [[{ type: 'property', name: 'columns' }], [{ ...diagnostic, column: 9 }]]) {
      expect(observe(complete, diagnostics, rules)).toMatchObject({ outputFormat: 'lynx-decoder-template' })
    }
    expect(observe(complete, [diagnostic], [...rules, rules[0]!])).toMatchObject({ outputFormat: 'lynx-decoder-template' })
  })

  it('没有固定 oracle 的可读输出仍保持未验证', () => {
    expect(conversionCaseResult({ ...candidate, candidate: 'unknown' }, 'lynx', lynxLiteralObservation('unknown', { css: '.unknown{width:1px}', diagnostics: [], rules: [] }), []).status).toBe('not-run')
  })
})
