import type { ConversionSnapshot, ReviewedConversionOracle } from './tailwind-capabilities/conversion-audit'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { conversionCaseResult } from './tailwind-capabilities/conversion-audit'
import { reviewedClassEncoding } from './tailwind-capabilities/conversion-oracles/syntax'
import { reviewedWeappOracle, reviewedWeappOracleCoverage, reviewedWeappOracles } from './tailwind-capabilities/conversion-oracles/weapp'
import { cssDeclarations } from './tailwind-capabilities/css'
import { withGeneratorFixture } from './tailwind-capabilities/fixture'
import { loadInventory } from './tailwind-capabilities/inventory/index'
import { defaultReferenceBuilder } from './tailwind-capabilities/reference'

function snapshot(css: string, candidate: string): ConversionSnapshot {
  const contexts = cssDeclarations(css).contextsByClass.get(reviewedClassEncoding(candidate)!) ?? []
  return {
    statements: contexts.map(context => ({ selector: context.selector, conditions: context.atRules, property: context.declaration.property, value: context.declaration.value, important: Boolean(context.declaration.important) })),
    diagnostics: [],
  }
}

function check(oracle: ReviewedConversionOracle, observed: ConversionSnapshot) {
  return conversionCaseResult({ id: oracle.candidate, candidate: oracle.candidate, features: [] }, 'weapp', { execution: 'completed', snapshot: observed, diagnosticsScope: 'candidate' }, ['memory.wxss'], oracle)
}

describe('独立 WXSS 字面量转换合同', () => {
  it('按固定字符合同编码任意值、负值、小数、分数和 important', () => {
    expect(reviewedClassEncoding('w-[13px]')).toBe('w-_b13px_B')
    expect(reviewedClassEncoding('-mt-0.5!')).toBe('-mt-0_d5_e')
    expect(reviewedClassEncoding('w-1/2')).toBe('w-1_f2')
    expect(reviewedClassEncoding('[color:#fff]')).toBe('_bcolor_c_hfff_B')
    expect(reviewedClassEncoding('has-[a>b]:w-(--x)')).toBe('has-_ba_gb_B_cw-_p--x_P')
    expect(reviewedClassEncoding('w-[13 px]')).toBeUndefined()
    expect(reviewedClassEncoding('w-中文')).toBeUndefined()
  })

  it('独立参考声明完整保留单位、顺序、important 和媒体条件', () => {
    const [attempt] = reviewedWeappOracles(['size-[2rem]!'], '@media print{.size-\\[2rem\\]\\!{width:2rem!important;height:2rem!important}}')
    expect(attempt!.gaps).toEqual([])
    expect(attempt!.oracle!.expected).toEqual({
      statements: ['width', 'height'].map(property => ({ selector: '.size-_b2rem_B_e', conditions: ['@media print'], property, value: '2rem', important: true })),
      diagnostics: [],
    })
  })

  it.each([
    ['width', '13px'],
    ['height', '2rem'],
    ['padding', '1.5em'],
    ['margin-left', '-2px'],
    ['color', '#c0ffee'],
    ['display', 'flex'],
    ['flex-direction', 'column-reverse'],
    ['opacity', '0.5'],
    ['border-radius', '17px'],
  ])('已审查 %s:%s 在运行前产生完整编码预期', (property, value) => {
    const [attempt] = reviewedWeappOracles(['probe'], `.probe{${property}:${value}}`)
    expect(attempt!.oracle).toMatchObject({ support: 'supported', expected: { statements: [{ property, value, selector: '.probe' }] } })
  })

  it.each([
    '.probe{width:var(--spacing)}',
    '.probe{width:calc(1rem * 2)}',
    '.probe{color:oklch(50% .2 20)}',
    '.probe{margin-inline-start:1px}',
    '.probe{border-radius:10000px}',
    '.probe{width:13px;unknown-property:1}',
    '.probe{--tw-content:"";content:var(--tw-content)}',
    '.probe:hover{width:13px}',
    '.parent .probe{width:13px}',
    '.probe::before{width:13px}',
    '@supports(display:grid){.probe{width:13px}}',
    '@media(width >= 40rem){.probe{width:13px}}',
    '@container(min-width:1px){.probe{width:13px}}',
  ])('未审查输入保留缺口，不能部分生成 oracle：%s', (source) => {
    const [attempt] = reviewedWeappOracles(['probe'], source)
    expect(attempt!.oracle).toBeUndefined()
    expect(attempt!.gaps.length).toBeGreaterThan(0)
  })

  it('空参考、其它类和只保留已知声明的源都不能冒充完整参考', () => {
    expect(reviewedWeappOracle('probe', []).gaps).toMatchObject([{ code: 'empty-reference' }])
    const contexts = cssDeclarations('.other{width:13px}').contextsByClass.get('other')!
    expect(reviewedWeappOracle('probe', contexts).gaps).toMatchObject([{ code: 'selector' }])
    const [attempt] = reviewedWeappOracles(['probe'], '.probe{width:13px;filter:blur(1px)}')
    expect(attempt!.oracle).toBeUndefined()
    expect(attempt!.gaps).toMatchObject([{ code: 'declaration', property: 'filter' }])
  })

  it('反例阻断空规则、部分声明、错误单位、丢失条件/important、错误选择器和后续覆盖', () => {
    const [attempt] = reviewedWeappOracles(['size-[2rem]!'], '@media print{.size-\\[2rem\\]\\!{width:2rem!important;height:2rem!important}}')
    const oracle = attempt!.oracle!
    const expected = oracle.expected
    expect(check(oracle, expected).status).toBe('passed')
    const wrong: ConversionSnapshot[] = [
      { ...expected, statements: [] },
      { ...expected, statements: expected.statements.slice(0, 1) },
      { ...expected, statements: expected.statements.map(item => ({ ...item, value: '2px' })) },
      { ...expected, statements: expected.statements.map(item => ({ ...item, conditions: [] })) },
      { ...expected, statements: expected.statements.map(item => ({ ...item, important: false })) },
      { ...expected, statements: expected.statements.map(item => ({ ...item, selector: '.wrong' })) },
      { ...expected, statements: [...expected.statements, { ...expected.statements[0]!, value: '4rem' }] },
    ]
    expect(wrong.map(observed => check(oracle, observed).status)).toEqual(Array.from({ length: wrong.length }).fill('failed'))
  })

  it('覆盖统计去重，合同覆盖不能写成转换通过或平台支持', () => {
    const attempts = reviewedWeappOracles(['flex', 'flex', 'w-4'], '.flex{display:flex}.w-4{width:calc(var(--spacing) * 4)}')
    expect(reviewedWeappOracleCoverage(attempts)).toEqual({
      target: 'weapp',
      contract: 'weapp-literal-preservation-v1',
      candidates: 2,
      reviewed: 1,
      unresolved: 1,
      gaps: [{ reason: 'declaration/width', candidates: 1 }],
    })
    const unresolved = conversionCaseResult({ id: 'w-4', candidate: 'w-4', features: [] }, 'weapp', { execution: 'completed', snapshot: { statements: [], diagnostics: [] }, diagnosticsScope: 'candidate' }, [], attempts[2]!.oracle)
    expect(unresolved.status).toBe('not-run')
  })

  it('真实转换核对任意值、负值、小数、important、任意属性和 print 条件', async () => {
    const candidates = ['size-[2rem]!', '-mt-px', 'w-[12.5px]', 'print:w-[13px]', '[color:#c0ffee]', 'p-[1.5em]']
    const reference = await (await defaultReferenceBuilder())(candidates)
    const attempts = reviewedWeappOracles(candidates, reference)
    expect(attempts.every(attempt => attempt.oracle)).toBe(true)
    const fixtureRoot = fileURLToPath(new URL('..', import.meta.url))
    await withGeneratorFixture(fixtureRoot, '@import "tailwindcss" source(none);', {}, async (generator) => {
      const generated = await generator.generate({ target: 'weapp', candidates, scanSources: false })
      expect(attempts.map(attempt => ({ candidate: attempt.candidate, status: check(attempt.oracle!, snapshot(generated.css, attempt.candidate)).status }))).toEqual(candidates.map(candidate => ({ candidate, status: 'passed' })))
    })
  })

  it('固定 23,286 completion 的已审查覆盖，并用产品真实内存转换核对每条完整合同', async () => {
    const inventory = await loadInventory()
    const candidates = inventory.completions.map(item => item.candidate)
    const reference = await (await defaultReferenceBuilder())(candidates)
    const attempts = reviewedWeappOracles(candidates, reference)
    expect(reviewedWeappOracleCoverage(attempts)).toMatchObject({ candidates: 23286, reviewed: 490, unresolved: 22796 })
    const oracles = attempts.flatMap(attempt => attempt.oracle ? [attempt.oracle] : [])
    const fixtureRoot = fileURLToPath(new URL('..', import.meta.url))
    await withGeneratorFixture(fixtureRoot, '@import "tailwindcss" source(none);', {}, async (generator) => {
      // 合同已全部固定，目标转换仅在此后执行。
      const generated = await generator.generate({ target: 'weapp', candidates: oracles.map(oracle => oracle.candidate), scanSources: false })
      const parsed = cssDeclarations(generated.css)
      const failures = oracles.flatMap((oracle) => {
        const contexts = parsed.contextsByClass.get(reviewedClassEncoding(oracle.candidate)!) ?? []
        const observed: ConversionSnapshot = { statements: contexts.map(context => ({ selector: context.selector, conditions: context.atRules, property: context.declaration.property, value: context.declaration.value, important: Boolean(context.declaration.important) })), diagnostics: [] }
        const result = check(oracle, observed)
        return result.status === 'passed' ? [] : [{ candidate: oracle.candidate, expected: oracle.expected, observed }]
      })
      expect(failures).toEqual([])
      expect(snapshot(generated.css, 'block')).toEqual(oracles.find(oracle => oracle.candidate === 'block')!.expected)
    })
  })
})
