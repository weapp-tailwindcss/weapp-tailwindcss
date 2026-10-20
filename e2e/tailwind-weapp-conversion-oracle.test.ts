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

const staticLiteralExamples = [
  ['appearance', 'none'],
  ['resize', 'both'],
  ['border-style', 'groove'],
  ['border-left-style', 'double'],
  ['outline-style', 'solid'],
  ['overflow', 'clip'],
  ['word-break', 'keep-all'],
  ['hyphens', 'manual'],
  ['cursor', 'nesw-resize'],
  ['user-select', 'all'],
  ['text-wrap', 'balance'],
  ['caption-side', 'bottom'],
  ['break-after', 'column'],
  ['break-inside', 'avoid-column'],
  ['box-decoration-break', 'clone'],
  ['font-stretch', '125%'],
  ['grid-auto-flow', 'row dense'],
  ['grid-column-start', '-3'],
  ['grid-row-end', 'auto'],
  ['grid-template-columns', 'subgrid'],
  ['grid-auto-rows', 'min-content'],
  ['background-size', 'cover'],
  ['background-position', 'left top'],
  ['object-position', 'right bottom'],
  ['transform-origin', '0 100%'],
  ['perspective-origin', '100% 0'],
  ['will-change', 'scroll-position'],
  ['touch-action', 'manipulation'],
  ['scrollbar-width', 'thin'],
  ['scrollbar-gutter', 'stable both-edges'],
  ['overscroll-behavior', 'contain'],
  ['aspect-ratio', '1 / 1'],
  ['columns', '3'],
  ['flex', '0 auto'],
  ['content', 'none'],
  ['rotate', 'none'],
] as const

const compatibilityExamples = [
  ['overflow-wrap', 'anywhere', ['word-wrap:anywhere']],
  ['overflow-wrap', 'break-word', ['word-wrap:break-word']],
  ['overflow-wrap', 'normal', ['word-wrap:normal']],
  ['break-before', 'avoid-page', ['page-break-before:avoid', 'break-before:avoid-page']],
  ['break-after', 'page', ['page-break-after:always', 'break-after:page']],
  ['break-inside', 'avoid-page', ['page-break-inside:avoid', 'break-inside:avoid-page']],
  ['font-variant-numeric', 'normal', ['font-feature-settings:normal', 'font-variant-numeric:normal']],
  ['place-content', 'safe center', ['align-content:safe center', 'justify-content:safe center', 'place-content:safe center']],
  ['place-content', 'baseline', ['align-content:baseline', 'justify-content:start', 'place-content:baseline']],
  ['place-items', 'end', ['align-items:end', 'justify-items:end', 'place-items:end']],
  ['place-self', 'auto', ['align-self:auto', 'justify-self:auto', 'place-self:auto']],
  ['opacity', '50%', ['opacity:0.5']],
  ['opacity', '100%', ['opacity:1']],
  ['text-align', 'start', ['text-align:left']],
  ['text-align', 'end', ['text-align:right']],
  ['inset', '2px', ['top:2px', 'right:2px', 'bottom:2px', 'left:2px']],
  ['background-clip', 'text', ['-webkit-background-clip:text', 'background-clip:text']],
] as const

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

describe('独立 WXSS 字面量与关键字兼容合同', () => {
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

  it.each(staticLiteralExamples)('新增静态语法族 %s:%s 在目标执行前登记完整声明', (property, value) => {
    const [attempt] = reviewedWeappOracles(['probe'], `.probe{${property}:${value}}`)
    expect(attempt!.gaps).toEqual([])
    expect(attempt!.oracle!.expected.statements).toEqual([{ selector: '.probe', conditions: [], property, value, important: false }])
  })

  it.each(compatibilityExamples)('默认兼容 %s:%s 先冻结完整预期及错误展开反例', (property, value, expected) => {
    const [attempt] = reviewedWeappOracles(['probe'], `.probe{${property}:${value}}`)
    const oracle = attempt!.oracle!
    expect(oracle.expected.statements.map(item => `${item.property}:${item.value}`)).toEqual(expected)
    const incorrect = [
      oracle.expected.statements.slice(1),
      oracle.expected.statements.map(item => ({ ...item, value: 'wrong' })),
      [...oracle.expected.statements, { selector: '.probe', conditions: [], property: 'unknown-property', value: 'none', important: false }],
    ]
    expect(incorrect.map(statements => check(oracle, { statements, diagnostics: [] }).status)).toEqual(['failed', 'failed', 'failed'])
  })

  it.each([['-webkit-hyphens', 'none'], ['-webkit-user-select', 'none'], ['-webkit-box-decoration-break', 'slice']])('默认裁剪 %s 只能在完整候选仍有声明时建立正向合同', (property, value) => {
    const [onlyPrefix] = reviewedWeappOracles(['probe'], `.probe{${property}:${value}}`)
    expect(onlyPrefix!.oracle).toBeUndefined()
    expect(onlyPrefix!.gaps).toMatchObject([{ code: 'empty-target' }])
    const [paired] = reviewedWeappOracles(['probe'], `.probe{${property}:${value};display:block}`)
    expect(paired!.oracle!.expected.statements).toMatchObject([{ property: 'display', value: 'block' }])
    expect(check(paired!.oracle!, { statements: [], diagnostics: [] }).status).toBe('failed')
  })

  it.each([
    ['appearance', 'var(--appearance)'],
    ['resize', 'calc(1 + 1)'],
    ['border-style', 'solid none'],
    ['border-left-style', 'groovy'],
    ['overflow-wrap', 'overflow-anywhere'],
    ['word-break', 'auto-phrase'],
    ['hyphens', 'var(--hyphens)'],
    ['cursor', 'url("cursor.png"), auto'],
    ['user-select', 'contain'],
    ['font-stretch', 'calc(100% + 1%)'],
    ['opacity', '150%'],
    ['opacity', '-1%'],
    ['grid-column-start', '0'],
    ['justify-content', 'baseline'],
    ['grid-template-columns', 'repeat(2, 1fr)'],
    ['touch-action', 'var(--tw-pan-x) var(--tw-pan-y)'],
    ['columns', 'min(2, 3)'],
    ['flex', '1 1 auto'],
    ['mask-composite', 'intersect'],
    ['color-scheme', 'light dark'],
    ['unknown-property', 'none'],
  ])('未审查或复合语法 %s:%s 仍无oracle，不能按属性名泛化通过', (property, value) => {
    const [attempt] = reviewedWeappOracles(['probe'], `.probe{${property}:${value}}`)
    expect(attempt!.oracle).toBeUndefined()
    expect(attempt!.gaps).toMatchObject([{ code: 'declaration', property, value }])
  })

  it('静态关键字已知也不能忽略同一候选的变量初始化或后续未知声明', () => {
    for (const source of ['.probe{--tw-border-style:solid;border-style:solid}', '.probe{cursor:pointer;touch-action:var(--gesture)}']) {
      const [attempt] = reviewedWeappOracles(['probe'], source)
      expect(attempt!.oracle).toBeUndefined()
      expect(attempt!.gaps).toMatchObject([{ code: 'declaration' }])
    }
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
      contract: 'weapp-keyword-compatibility-v2',
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

  it('每个新增静态语法示例均经官方独立预期和产品真实内存转换核对', async () => {
    const candidates = [...staticLiteralExamples, ...compatibilityExamples].map(([property, value]) => `[${property}:${value.replaceAll(' ', '_')}]`)
    const reference = await (await defaultReferenceBuilder())(candidates)
    const attempts = reviewedWeappOracles(candidates, reference)
    expect(attempts.filter(attempt => !attempt.oracle)).toEqual([])
    const fixtureRoot = fileURLToPath(new URL('..', import.meta.url))
    await withGeneratorFixture(fixtureRoot, '@import "tailwindcss" source(none);', {}, async (generator) => {
      const generated = await generator.generate({ target: 'weapp', candidates, scanSources: false })
      const failures = attempts.flatMap((attempt) => {
        const observed = snapshot(generated.css, attempt.candidate)
        return check(attempt.oracle!, observed).status === 'passed' ? [] : [{ candidate: attempt.candidate, expected: attempt.oracle!.expected.statements.map(item => `${item.property}:${item.value}`), observed: observed.statements.map(item => `${item.property}:${item.value}`) }]
      })
      expect(failures).toEqual([])
    })
  })

  it('固定 23,286 completion 的已审查覆盖，并用产品真实内存转换核对每条完整合同', async () => {
    const inventory = await loadInventory()
    const candidates = inventory.completions.map(item => item.candidate)
    const reference = await (await defaultReferenceBuilder())(candidates)
    const attempts = reviewedWeappOracles(candidates, reference)
    expect(reviewedWeappOracleCoverage(attempts)).toMatchObject({ candidates: 23286, reviewed: 848, unresolved: 22438 })
    const oracles = attempts.flatMap(attempt => attempt.oracle ? [attempt.oracle] : [])
    // 逐合同验证声明丢失反例，再执行产品转换；空集或部分声明不能成为成功基线。
    expect(oracles.filter(oracle => check(oracle, { ...oracle.expected, statements: oracle.expected.statements.slice(1) }).status !== 'failed')).toEqual([])
    const fixtureRoot = fileURLToPath(new URL('..', import.meta.url))
    await withGeneratorFixture(fixtureRoot, '@import "tailwindcss" source(none);', {}, async (generator) => {
      // 合同已全部固定，目标转换仅在此后执行。
      const generated = await generator.generate({ target: 'weapp', candidates: oracles.map(oracle => oracle.candidate), scanSources: false })
      const parsed = cssDeclarations(generated.css)
      const failures = oracles.flatMap((oracle) => {
        const contexts = parsed.contextsByClass.get(reviewedClassEncoding(oracle.candidate)!) ?? []
        const observed: ConversionSnapshot = { statements: contexts.map(context => ({ selector: context.selector, conditions: context.atRules, property: context.declaration.property, value: context.declaration.value, important: Boolean(context.declaration.important) })), diagnostics: [] }
        const result = check(oracle, observed)
        return result.status === 'passed' ? [] : [{ candidate: oracle.candidate, expected: oracle.expected.statements.map(item => `${item.property}:${item.value}`), observed: observed.statements.map(item => `${item.property}:${item.value}`) }]
      })
      expect(failures).toEqual([])
      expect(snapshot(generated.css, 'block')).toEqual(oracles.find(oracle => oracle.candidate === 'block')!.expected)
    })
  })
})
