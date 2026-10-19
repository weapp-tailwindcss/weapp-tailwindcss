import type { ConversionSnapshot, ReviewedConversionOracle } from './tailwind-capabilities/conversion-audit'
import { describe, expect, it } from 'vitest'
import { conversionCaseResult } from './tailwind-capabilities/conversion-audit'
import { reactNativeReferenceCandidates, reviewedReactNativeOracle, reviewedReactNativeOracleCoverage, reviewedReactNativeOracles } from './tailwind-capabilities/conversion-oracles/react-native'
import { reviewedNativeDeclaration } from './tailwind-capabilities/conversion-oracles/react-native/properties'
import { reviewedNativeNumber, reviewedNativeVariables } from './tailwind-capabilities/conversion-oracles/react-native/values'
import { cssDeclarations } from './tailwind-capabilities/css'
import { loadInventory } from './tailwind-capabilities/inventory'
import { convertNativeCandidates, nativeConversionSnapshot } from './tailwind-capabilities/native-conversion'
import { defaultReferenceBuilder } from './tailwind-capabilities/reference'

const fixedMappings = [
  ['display', 'flex', { display: 'flex' }],
  ['display', 'contents', { display: 'contents' }],
  ['position', 'static', { position: 'static' }],
  ['position', 'absolute', { position: 'absolute' }],
  ['opacity', '50%', { opacity: 0.5 }],
  ['flex-direction', 'row-reverse', { flexDirection: 'row-reverse' }],
  ['flex-wrap', 'wrap', { flexWrap: 'wrap' }],
  ['align-items', 'baseline', { alignItems: 'baseline' }],
  ['align-self', 'auto', { alignSelf: 'auto' }],
  ['align-content', 'space-evenly', { alignContent: 'space-evenly' }],
  ['justify-content', 'space-between', { justifyContent: 'space-between' }],
  ['background-color', '#fff', { backgroundColor: '#fff' }],
  ['color', 'black', { color: 'black' }],
  ['width', '1.5rem', { width: 24 }],
  ['height', '25%', { height: '25%' }],
  ['top', '-13px', { top: -13 }],
  ['margin', '-13px 7px', { marginTop: -13, marginRight: 7, marginBottom: -13, marginLeft: 7 }],
  ['padding', 'calc(0.25rem * 4)', { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 }],
  ['padding-inline', '7px', { paddingHorizontal: 7 }],
  ['flex-grow', '1', { flexGrow: 1 }],
  ['letter-spacing', '-2px', { letterSpacing: -2 }],
] as const

const statement = (selector: string, property: string, value: unknown) => ({ selector, conditions: [], property, value, important: false })
const attempt = (candidate: string, css: string) => reviewedReactNativeOracles([candidate], css)[0]!
const result = (oracle: ReviewedConversionOracle, snapshot: ConversionSnapshot) => conversionCaseResult({ id: oracle.candidate, candidate: oracle.candidate, features: [] }, 'react-native', { execution: 'completed', snapshot, diagnosticsScope: 'candidate' }, [], oracle)

describe('独立 RN 0.81 字面量编码合同', () => {
  it.each(fixedMappings)('%s:%s 的预期由固定语义表给出', (property, value, expected) => {
    expect(reviewedNativeDeclaration(property, value)).toEqual({ entries: Object.entries(expected) })
  })

  it.each([
    ['position', 'fixed', 'position'],
    ['position', 'sticky', 'position'],
    ['display', 'block', 'display'],
    ['align-items', 'normal', 'alignItems'],
    ['align-items', 'safe center', 'alignItems'],
    ['justify-content', 'stretch', 'justifyContent'],
    ['filter', 'blur(4px)', 'filter'],
  ])('先声明拒绝 %s:%s，不能从执行失败反推', (property, value, rejectedProperty) => {
    expect(reviewedNativeDeclaration(property, value)).toEqual({ rejectedProperty })
  })

  it.each([
    ['width', '-1px'],
    ['width', '-1%'],
    ['z-index', '1.5'],
    ['font-size', '2em'],
    ['padding', '1px 2px 3px 4px 5px'],
    ['gap', 'normal'],
    ['color', 'currentColor'],
  ])('未经完整审查的 %s:%s 留下缺口', (property, value) => {
    expect(reviewedNativeDeclaration(property, value)).toBeUndefined()
  })

  it('非有限数字不能进入 JSON oracle', () => {
    expect(reviewedNativeNumber('9'.repeat(400), false)).toBeUndefined()
    expect(reviewedNativeNumber(`calc(${'9'.repeat(200)} * ${'9'.repeat(200)})`, false)).toBeUndefined()
  })

  it.each([
    '',
    '.other { width:13px }',
    '.probe { width:13px; unknown-property:yes }',
    '@media (min-width: 640px) {.probe {width:13px}}',
    '.probe:hover {width:13px}',
    '.probe {width:13px} .probe {width:17px}',
    '.probe {--local:13px; width:var(--local)}',
  ])('空、错归属、部分声明或条件不能产生完整正向 oracle：%s', (css) => {
    expect(attempt('probe', css).oracle).toBeUndefined()
  })

  it('负向参考也必须准确归属于候选', () => {
    const contexts = cssDeclarations('.other:hover {width:13px}').contextsByClass.get('other')!
    expect(reviewedReactNativeOracle('hover:probe', contexts).oracle).toBeUndefined()
  })

  it.each([
    ':root {--size:13px} .local {--size:17px}',
    ':root {--size:13px} @media (prefers-color-scheme:dark) {:root {--size:17px}}',
    ':root {--size:13px; --size:17px}',
  ])('局部、条件或冲突变量依赖不能当作无条件常量：%s', (css) => {
    expect(reviewedNativeVariables(css).has('--size')).toBe(false)
    expect(attempt('probe', `${css}.probe {width:var(--size)}`).oracle).toBeUndefined()
  })

  it('保留完整四边、important、dark 和 platform；错误值与缺失均失败', () => {
    const oracle = attempt('dark:ios:probe', '.probe {padding:13px 7px!important}').oracle!
    expect(oracle.expected).toEqual({ statements: ['Top', 'Right', 'Bottom', 'Left'].map((side, index) => ({ selector: 'dark:ios:probe', conditions: ['color-scheme:dark', 'platform:ios'], property: `padding${side}`, value: [13, 7, 13, 7][index], important: true })), diagnostics: [] })
    expect(result(oracle, oracle.expected).status).toBe('passed')
    const mutate = (change: (snapshot: { statements: any[], diagnostics: string[] }) => void) => {
      const snapshot = structuredClone(oracle.expected) as { statements: any[], diagnostics: string[] }
      change(snapshot)
      expect(result(oracle, snapshot).status).toBe('failed')
    }
    mutate((snapshot) => {
      snapshot.statements[0].value = 99
    })
    mutate((snapshot) => {
      snapshot.statements.pop()
    })
    mutate((snapshot) => {
      snapshot.statements[0].important = false
    })
    mutate((snapshot) => {
      snapshot.statements[0].conditions = ['platform:ios']
    })
    mutate((snapshot) => {
      snapshot.statements[0].conditions = ['color-scheme:dark']
    })
    mutate((snapshot) => {
      snapshot.statements[0].selector = 'other'
    })
    mutate((snapshot) => {
      snapshot.statements.push(statement('dark:ios:probe', '@native/transformExpression', { value: 'translateX(1px)' }))
    })
    mutate((snapshot) => {
      snapshot.diagnostics.push('width:unexpected')
    })
  })

  it('负向必须具有准确诊断，空输出或残留非法属性不能通过', () => {
    const oracle = attempt('fixed', '.fixed {position:fixed}').oracle!
    expect(oracle.support).toBe('unsupported')
    expect(result(oracle, oracle.expected).status).toBe('passed')
    for (const snapshot of [
      { statements: [], diagnostics: [] },
      { statements: [], diagnostics: ['position:other'] },
      { statements: [statement('fixed', 'position', 'fixed')], diagnostics: oracle.expected.diagnostics },
    ]) {
      expect(result(oracle, snapshot).status).toBe('failed')
    }
  })

  it('未知、冲突原生条件保持缺口；覆盖统计不读取执行结果', () => {
    const attempts = ['probe', 'fixed', 'ios:android:probe', 'unknown'].map(candidate => attempt(candidate, '.probe {width:13px} .fixed {position:fixed}'))
    expect(reviewedReactNativeOracleCoverage(attempts)).toMatchObject({ candidates: 4, reviewed: 2, supported: 1, rejected: 1, unresolved: 2 })
  })

  it('真实官方默认主题参考先固定合同，再执行实际原生编译器', async () => {
    const candidates = [
      'flex',
      'hidden',
      'contents',
      'relative',
      'absolute',
      'static',
      'fixed',
      'sticky',
      'opacity-50',
      'flex-row',
      'flex-col-reverse',
      'flex-wrap',
      'items-center',
      'items-baseline',
      'self-auto',
      'content-between',
      'justify-evenly',
      'justify-stretch',
      'p-4',
      'px-3',
      'py-2',
      'm-4',
      '-mt-3',
      'w-4',
      'h-8',
      'size-4',
      'w-[13px]',
      'h-[25%]',
      '-top-[7px]',
      'z-[7]',
      'tracking-[-2px]',
      'text-black',
      'bg-white',
      'bg-[#123456]',
      'w-[17px]!',
      'dark:w-[19px]',
      'ios:w-[23px]',
      'android:h-[29px]',
      'native:p-4',
      'dark:ios:w-[31px]!',
      'hover:w-[13px]',
      'sm:w-[13px]',
      'ios:hover:w-[13px]',
    ]
    const referenceCandidates = reactNativeReferenceCandidates(candidates)
    const officialReference = await (await defaultReferenceBuilder())(referenceCandidates)
    const attempts = reviewedReactNativeOracles(candidates, officialReference)
    expect(attempts.filter(item => !item.oracle).map(item => [item.candidate, item.gaps.map(gap => gap.property)])).toEqual([['tracking-[-2px]', ['--tw-tracking']]])
    const oracles = attempts.flatMap(item => item.oracle ? [item.oracle] : [])
    const actual = convertNativeCandidates(officialReference, referenceCandidates, candidates)
    const failures = oracles.map(oracle => ({ candidate: oracle.candidate, result: result(oracle, nativeConversionSnapshot(actual, oracle.candidate)), actual: nativeConversionSnapshot(actual, oracle.candidate), expected: oracle.expected })).filter(item => item.result.status !== 'passed')
    expect(failures).toEqual([])
  })

  it('固定注册表的所有候选逐项核验已审查合同，未审查的候选不提升为通过', async () => {
    const { completions } = await loadInventory()
    const candidates = completions.map(item => item.candidate)
    const reference = await (await defaultReferenceBuilder())(candidates)
    const attempts = reviewedReactNativeOracles(candidates, reference)
    const oracles = attempts.flatMap(item => item.oracle ? [item.oracle] : [])
    const actual = convertNativeCandidates(reference, candidates, candidates)
    const failures = oracles.flatMap(oracle => result(oracle, nativeConversionSnapshot(actual, oracle.candidate)).status === 'passed' ? [] : [{ candidate: oracle.candidate, expected: oracle.expected, actual: nativeConversionSnapshot(actual, oracle.candidate) }])
    expect(failures).toEqual([])
    const coverage = reviewedReactNativeOracleCoverage(attempts)
    expect(coverage).toMatchObject({ candidates: 23_286, reviewed: 1599, supported: 1511, rejected: 88, unresolved: 21_687 })
    expect(coverage.reviewed + coverage.unresolved).toBe(coverage.candidates)
  }, 60_000)
})
