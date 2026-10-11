import path from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { replaceWxml } from '@/wxml/shared'
import { buildDemoBaseCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/base'
import { buildDemoExtendedCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/extended'
import { MINI_PROGRAM_REMOVED_CSS_UTILITIES } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/round-configs'
import { assertRoundOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class'

const cases = [...buildDemoBaseCases(process.cwd()), ...buildDemoExtendedCases(process.cwd())]
const scenarios = cases.flatMap(watchCase => [
  { name: `${watchCase.name}/template`, watchCase, kind: 'template' as const, mutation: watchCase.templateMutation },
  { name: `${watchCase.name}/script`, watchCase, kind: 'script' as const, mutation: watchCase.scriptMutation },
  ...watchCase.subPackageMutations!.map(entry => ({
    name: `${watchCase.name}/${entry.root}`,
    watchCase,
    kind: 'template' as const,
    mutation: entry.templateMutation,
  })),
]).filter(({ mutation }) => mutation.roundConfigs?.some(round => round.name === 'complex-corpus' && round.buildClassTokens('000037').includes(MINI_PROGRAM_REMOVED_CSS_UTILITIES[0].utility)))
const supportedGroup = 'group-[:nth-of-type(3)_&]:block'
const utilities = [...MINI_PROGRAM_REMOVED_CSS_UTILITIES.map(item => item.utility), 'flex', supportedGroup]
const escaped = utilities.map(item => replaceWxml(item))
let generatedCss: string

beforeAll(async () => {
  const source = await resolveTailwindV4Source({
    css: '@import "tailwindcss" source(none);',
    base: path.resolve(import.meta.dirname, '..'),
  })
  const generated = await createTailwindV4Engine(source).generate({ candidates: utilities, target: 'weapp' })
  // 负向合同来自真实生成管线：原始 CSS 有条件规则，小程序兼容阶段主动移除。
  expect(generated.rawCss).toContain('@supports')
  expect(generated.css).not.toContain('@supports')
  expect(generated.css).not.toContain(':hover')
  expect(generated.css).toContain('.flex')
  expect(generated.css).toContain(`.${replaceWxml(supportedGroup)}`)
  generatedCss = generated.css
})

it.each(scenarios)('$name 验证条件规则移除，同时保留类消费和受支持 CSS 的断言', ({ watchCase, kind, mutation }) => {
  const corpus = mutation.roundConfigs!.find(round => round.name === 'complex-corpus')!.buildClassTokens('000037')
  for (const { utility } of MINI_PROGRAM_REMOVED_CSS_UTILITIES) {
    expect(corpus).toContain(utility)
    expect(mutation.expectedRemovedCssUtilities).toContainEqual(MINI_PROGRAM_REMOVED_CSS_UTILITIES.find(item => item.utility === utility))
  }
  expect(corpus).toContain(supportedGroup)
  expect(mutation.expectedRemovedCssUtilities).not.toContainEqual(expect.objectContaining({ utility: supportedGroup }))
  const outputs = {
    wxml: `<view class="${escaped.join(' ')}"/>`,
    js: `const classes = '${escaped.join(' ')}'`,
    globalStyle: generatedCss,
  }
  const verify = (value: typeof outputs) => assertRoundOutputs(watchCase, kind, mutation.sourceFile, 'add', mutation, [], [], 1, utilities, escaped, value)
  expect(() => verify(outputs)).not.toThrow()
  expect(() => verify({ ...outputs, globalStyle: '' })).toThrow('missing class/CSS evidence for flex')
  expect(() => verify({ ...outputs, globalStyle: '.flex{display:flex}' })).toThrow(`missing class/CSS evidence for ${supportedGroup}`)
  expect(() => verify({ ...outputs, globalStyle: `${generatedCss}@supports(display:grid){.${escaped[0]}{display:grid}}` })).toThrow('remove @supports')
  const target = mutation.verifyEscapedIn[0]!
  expect(() => verify({ ...outputs, [target]: outputs[target].replace(escaped[0]!, '') })).toThrow('missing original class token')
})
