import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { buildDemoBaseCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/base'
import { buildUniAppHBuilderXCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/hbuilderx'
import { MINI_PROGRAM_REMOVED_CSS_UTILITIES } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/round-configs'
import { assertRoundOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'

const utility = '[@supports(display:grid)]:grid'
const escaped = replaceWxml(utility)
const removal = { utility, condition: 'supports' as const }
const present = { wxml: `<view class="${escaped}"/>`, js: `const classes = '${escaped}'`, globalStyle: '' }

describe('watch evidence for platform-removed rules', () => {
  it.each(['wxml', 'js'] as const)('retains explicit negative evidence and verifies rollback in %s', (target) => {
    const evidence = assertClassTokensInOutput(present, [utility], [escaped], [target], 'removed', true, true, [removal])
    expect(evidence).toEqual([{ utility, escapedClass: escaped, actualClass: escaped, target, ruleSignatures: [], cssExpectation: 'removed', consumerAliases: [] }])
    expect(() => assertPreviousClassEvidenceRemoved(present, evidence, [], 'rollback')).toThrow('stale class')
    expect(() => assertPreviousClassEvidenceRemoved({ wxml: '', js: '', globalStyle: '' }, evidence, [], 'rollback')).not.toThrow()
  })

  it('does not infer a removal expectation from missing rules', () => {
    expect(() => assertClassTokensInOutput(present, [utility], [escaped], ['wxml'], 'missing')).toThrow('missing class/CSS evidence')
    expect(() => assertClassTokensInOutput(present, [utility], [escaped], ['wxml'], 'wrong-expectation', true, true, [{ utility: 'hover:block', condition: 'hover' }])).toThrow('missing class/CSS evidence')
  })

  it('rejects surviving conditional CSS even when a removal is configured', () => {
    const outputs = { ...present, globalStyle: `@supports(display:grid){.${escaped}{display:grid}}` }
    expect(() => assertClassTokensInOutput(outputs, [utility], [escaped], ['wxml'], 'survived', true, true, [removal])).toThrow('expected platform to remove @supports rules')
  })

  it('rejects missing source tokens and cannot infer their identity from unrelated safe aliases', () => {
    const outputs = { ...present, wxml: '<view class="wtu-other-0"/>' }
    expect(() => assertClassTokensInOutput(outputs, [utility], [escaped], ['wxml'], 'missing-token', true, true, [removal])).toThrow('missing original class token')
  })

  it.each([
    '@supports(display:grid){.wtu-supports-0{display:grid}}',
    '@media(width>1px){@supports(display:grid){.wtu-supports-0{display:grid}}}',
  ])('rejects surviving conditional safe alias rules: %s', (globalStyle) => {
    expect(() => assertClassTokensInOutput({ ...present, globalStyle }, [utility], [escaped], ['wxml'], 'alias-survived', true, true, [removal])).toThrow('remove @supports')
  })

  it('rejects hover aliases without confusing class names, attributes or comments with pseudos', () => {
    const hover = 'hover:block'
    const token = replaceWxml(hover)
    const outputs = { ...present, wxml: `<view class="${token} wtu-hover-0"/>` }
    const expected = [{ utility: hover, condition: 'hover' as const }]
    expect(() => assertClassTokensInOutput({ ...outputs, globalStyle: '.wtu-hover-0:hover{display:block}' }, [hover], [token], ['wxml'], 'hover-survived', true, true, expected)).toThrow('remove :hover')
    expect(() => assertClassTokensInOutput({ ...outputs, globalStyle: '.unrelated[data-text=":hover"]{content:"@supports"}/* :hover */' }, [hover], [token], ['wxml'], 'text-only', true, true, expected)).not.toThrow()
  })

  it('checks all newly consumed aliases on final rollback without assigning them to a removed utility', () => {
    const outputs = { ...present, wxml: `<view class="${escaped} wtu-supports-0 wtu-baseline-0"/>` }
    const evidence = assertClassTokensInOutput(outputs, [utility], [escaped], ['wxml'], 'consumer', true, true, [removal])
    expect(evidence[0]?.consumerAliases).toEqual(['wtu-supports-0', 'wtu-baseline-0'])
    const baseline = { ...present, wxml: '<view class="wtu-baseline-0"/>' }
    expect(() => assertPreviousClassEvidenceRemoved({ ...outputs, wxml: '<view class="wtu-supports-0 wtu-baseline-0"/>' }, evidence, [], 'rollback', baseline)).toThrow('stale class wtu-supports-0')
    expect(() => assertPreviousClassEvidenceRemoved(baseline, evidence, [], 'rollback', baseline)).not.toThrow()
    expect(() => assertPreviousClassEvidenceRemoved({ ...outputs, wxml: '<view class="wtu-supports-0"/>' }, evidence, ['flex'], 'modify', baseline)).not.toThrow()
  })

  it('continues to require CSS for supported utilities in the same mutation', () => {
    const outputs = { ...present, wxml: `<view class="${escaped} flex"/>` }
    expect(() => assertClassTokensInOutput(outputs, [utility, 'flex'], [escaped, 'flex'], ['wxml'], 'mixed', true, true, [removal])).toThrow('missing class/CSS evidence for flex')
    expect(assertClassTokensInOutput({ ...outputs, globalStyle: '.flex{display:flex}' }, [utility, 'flex'], [escaped, 'flex'], ['wxml'], 'mixed', true, true, [removal])).toHaveLength(2)
  })

  it('keeps all removed utilities in both uni-app x mutation corpora and propagates the expectations', () => {
    const watchCase = buildUniAppHBuilderXCases(process.cwd()).find(item => item.name === 'uni-app-x-vdom-tailwindcss-v4')!
    for (const kind of ['template', 'script'] as const) {
      const mutation = kind === 'template' ? watchCase.templateMutation : watchCase.scriptMutation
      const tokens = mutation.roundConfigs!.find(round => round.name === 'complex-corpus')!.buildClassTokens('000042')
      for (const removed of MINI_PROGRAM_REMOVED_CSS_UTILITIES) {
        expect(tokens).toContain(removed.utility)
        expect(mutation.expectedRemovedCssUtilities).toContain(removed)
      }
      const classTokens = [utility, 'flex']
      const outputs = { wxml: `<view class="${escaped} flex"/>`, js: `const classes = '${escaped} flex'`, globalStyle: '.flex{display:flex}' }
      expect(() => assertRoundOutputs(watchCase, kind, mutation.sourceFile, 'add', mutation, [], [], 1, classTokens, [escaped, 'flex'], outputs)).not.toThrow()
      expect(() => assertRoundOutputs(watchCase, kind, mutation.sourceFile, 'modify', mutation, [], [], 1, classTokens, [escaped, 'flex'], { ...outputs, globalStyle: '' })).toThrow('missing class/CSS evidence for flex')
    }
  })
})

const weappViteCase = buildDemoBaseCases(process.cwd()).find(item => item.name === 'weapp-vite-tailwindcss-v4')!
const weappViteMutations = [
  { name: 'main-template', kind: 'template' as const, mutation: weappViteCase.templateMutation },
  ...weappViteCase.subPackageMutations!.map(entry => ({ name: entry.root, kind: 'template' as const, mutation: entry.templateMutation })),
]

it.each(weappViteMutations)('weapp-vite $name 保留完整条件 token、负向 CSS 合同和回滚检查', ({ kind, mutation }) => {
  const corpus = mutation.roundConfigs!.find(round => round.name === 'complex-corpus')!.buildClassTokens('000042')
  for (const removed of MINI_PROGRAM_REMOVED_CSS_UTILITIES) {
    expect(corpus).toContain(removed.utility)
    expect(mutation.expectedRemovedCssUtilities).toContain(removed)
  }
  const classTokens = [...MINI_PROGRAM_REMOVED_CSS_UTILITIES.map(item => item.utility), 'flex']
  const escapedClasses = classTokens.map(item => replaceWxml(item))
  const outputs = {
    wxml: `<view class="${escapedClasses.join(' ')}"/>`,
    js: `const classes = '${escapedClasses.join(' ')}'`,
    globalStyle: '.flex{display:flex}',
  }
  const assertOutputs = (value: typeof outputs) => assertRoundOutputs(weappViteCase, kind, mutation.sourceFile, 'add', mutation, [], [], 1, classTokens, escapedClasses, value)
  expect(() => assertOutputs(outputs)).not.toThrow()
  expect(() => assertOutputs({ ...outputs, globalStyle: '' })).toThrow('missing class/CSS evidence for flex')
  expect(() => assertOutputs({ ...outputs, globalStyle: `${outputs.globalStyle}@supports(display:grid){.${escaped}{display:grid}}` })).toThrow('remove @supports')
  const target = mutation.verifyEscapedIn[0]!
  expect(() => assertOutputs({ ...outputs, [target]: outputs[target].replace(escaped, '') })).toThrow('missing original class token')
  const evidence = assertClassTokensInOutput(outputs, classTokens, escapedClasses, [target], 'weapp-vite', true, true, mutation.expectedRemovedCssUtilities)
  expect(() => assertPreviousClassEvidenceRemoved(outputs, evidence, [], 'rollback')).toThrow('stale class')
  expect(() => assertPreviousClassEvidenceRemoved({ wxml: '', js: '', globalStyle: '' }, evidence, [], 'rollback')).not.toThrow()
})
