import type { IStyleHandlerOptions } from '@/types'
import postcss from 'postcss'
import { ruleTransformSync } from '@/selectorParser/rule-transformer'

interface Scenario {
  name: string
  source: string
  warmup?: string
  options: () => IStyleHandlerOptions
  changes: Array<(options: IStyleHandlerOptions) => void>
}

export function transformRule(source: string, options: IStyleHandlerOptions) {
  const root = postcss.parse(`${source}{margin-top:1px;margin-bottom:2px;color:red}`)
  root.walkRules(rule => ruleTransformSync(rule, options))
  return root.toString()
}

export const selectorOptionMutationScenarios: Scenario[] = [
  {
    name: 'root/universal 等长数组原地修改和删除',
    source: ':root *',
    options: () => ({ cssSelectorReplacement: { root: ['page', '.first'], universal: ['view', 'text'] } }),
    changes: [
      (options) => { (options.cssSelectorReplacement!.root as string[])[1] = '.second' },
      (options) => { (options.cssSelectorReplacement!.universal as string[])[0] = 'input' },
      (options) => { options.cssSelectorReplacement = { root: 'view', universal: 'text' } },
      (options) => { delete options.cssSelectorReplacement },
    ],
  },
  {
    name: 'child 等长数组原地修改与回到默认值',
    source: '.a>:not(:last-child)',
    options: () => ({ cssChildCombinatorReplaceValue: ['view', 'text'] }),
    changes: [
      (options) => { (options.cssChildCombinatorReplaceValue as string[])[0] = 'input' },
      (options) => { options.cssChildCombinatorReplaceValue = 'text' },
      (options) => { options.cssChildCombinatorReplaceValue = [] },
      (options) => { delete options.cssChildCombinatorReplaceValue },
    ],
  },
  {
    name: 'uniAppX 往返使相同 selector 的缓存失效',
    source: '.a[hidden],.b:before',
    options: () => ({ uniAppX: false }),
    changes: [
      (options) => { options.uniAppX = true },
      (options) => { options.uniAppX = false },
    ],
  },
  ...(['cssRemoveHoverPseudoClass', 'cssRemoveActivePseudoClass', 'cssRemoveFocusPseudoClass'] as const).map(key => ({
    name: `${key} 开关往返`,
    source: '.a:hover,.b:active,.c:focus',
    options: () => ({}),
    changes: [
      (options: IStyleHandlerOptions) => { options[key] = true },
      (options: IStyleHandlerOptions) => { options[key] = false },
      (options: IStyleHandlerOptions) => { delete options[key] },
    ],
  })),
  {
    name: '首次原生调用早于 child 首次使用',
    warmup: '.warm:hover',
    source: '.target>:not(:last-child)',
    options: () => ({}),
    changes: [(options) => { options.cssChildCombinatorReplaceValue = 'text' }],
  },
  {
    name: '简单 selector 快路早于 hover 首次使用',
    warmup: '.warm',
    source: '.target:hover',
    options: () => ({}),
    changes: [(options) => { options.cssRemoveHoverPseudoClass = true }],
  },
  {
    name: 'escapeMap 内容变更和删除',
    source: String.raw`.a\:b *`,
    options: () => ({ escapeMap: {} }),
    changes: [
      (options) => { options.escapeMap![':'] = 'ONE' },
      (options) => { options.escapeMap![':'] = 'TWO' },
      (options) => { delete options.escapeMap![':'] },
    ],
  },
]
