import type { ReviewedConversionOracle } from '../conversion-audit'
import { cssDeclarations } from '../css'
import { lynxDisplayDocumentation, lynxRejectedDisplayValues } from '../lynx/display-contract'

type Declaration = readonly [property: string, value: string]
interface LiteralOracle { candidate: string, input: readonly Declaration[], output?: readonly Declaration[] }

const single = (candidate: string, property: string, value: string): LiteralOracle => ({ candidate, input: [[property, value]] })

/** 独立冻结的正向字面合同；值来自 Tailwind utility 定义及 Lynx 基础属性语义，不读取目标产物。 */
export const lynxLiteralOracles: readonly LiteralOracle[] = [
  single('flex', 'display', 'flex'),
  single('hidden', 'display', 'none'),
  single('relative', 'position', 'relative'),
  single('absolute', 'position', 'absolute'),
  ...[['row', 'row'], ['row-reverse', 'row-reverse'], ['col', 'column'], ['col-reverse', 'column-reverse']].map(([name, value]) => single(`flex-${name}`, 'flex-direction', value!)),
  ...[['wrap', 'wrap'], ['nowrap', 'nowrap'], ['wrap-reverse', 'wrap-reverse']].map(([name, value]) => single(`flex-${name}`, 'flex-wrap', value!)),
  single('grow', 'flex-grow', '1'),
  single('grow-0', 'flex-grow', '0'),
  single('shrink', 'flex-shrink', '1'),
  single('shrink-0', 'flex-shrink', '0'),
  ...[['start', 'flex-start'], ['end', 'flex-end'], ['center', 'center'], ['stretch', 'stretch'], ['baseline', 'baseline']].map(([name, value]) => single(`items-${name}`, 'align-items', value!)),
  ...[['start', 'flex-start'], ['end', 'flex-end'], ['center', 'center'], ['between', 'space-between'], ['around', 'space-around'], ['evenly', 'space-evenly']].map(([name, value]) => single(`justify-${name}`, 'justify-content', value!)),
  ...[['auto', 'auto'], ['start', 'flex-start'], ['end', 'flex-end'], ['center', 'center'], ['stretch', 'stretch']].map(([name, value]) => single(`self-${name}`, 'align-self', value!)),
  single('w-full', 'width', '100%'),
  single('h-full', 'height', '100%'),
  single('w-auto', 'width', 'auto'),
  single('h-auto', 'height', 'auto'),
  { candidate: 'size-full', input: [['width', '100%'], ['height', '100%']] },
  ...['left', 'center', 'right', 'justify'].map(value => single(`text-${value}`, 'text-align', value)),
  { candidate: 'p-px', input: [['padding', '1px']], output: [['padding-bottom', '1px'], ['padding-left', '1px'], ['padding-right', '1px'], ['padding-top', '1px']] },
]

function sorted(declarations: readonly Declaration[]) {
  return [...declarations].sort(([left], [right]) => left.localeCompare(right))
}

/** 先核对固定官方参考，再登记预期；未知主题或规则形态不自动扩展合同。 */
export function reviewedLynxOracles(candidates: readonly string[], reference: string): ReviewedConversionOracle[] {
  const parsed = cssDeclarations(reference)
  return candidates.flatMap<ReviewedConversionOracle>((candidate) => {
    const rejected = lynxRejectedDisplayValues.find(value => value === candidate)
    const fixed: LiteralOracle | undefined = lynxLiteralOracles.find(item => item.candidate === candidate) ?? (rejected ? { candidate, input: [['display', rejected]] } : undefined)
    if (!fixed) {
      return []
    }
    const contexts = parsed.contextsByClass.get(candidate) ?? []
    if (contexts.some(item => item.selector !== `.${candidate}` || item.atRules.length || item.declaration.important)) {
      return []
    }
    const actual = contexts.map(item => [item.declaration.property, item.declaration.value ?? ''] as const)
    if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(fixed.input))) {
      return []
    }
    if (rejected) {
      return [{
        id: `lynx/documented-display-rejection-v1/${candidate}`,
        target: 'lynx' as const,
        candidate,
        support: 'unsupported' as const,
        reason: `Lynx 官方 display 合同明确不支持 ${rejected}；编码后拒绝该声明不代表运行时支持。参见 ${lynxDisplayDocumentation}`,
        rejection: { kind: 'lynx-documented-display-rejection' as const, documentation: lynxDisplayDocumentation, property: 'display' as const, value: rejected },
        expected: { statements: [], diagnostics: [] },
      }]
    }
    return [{
      id: `lynx/literal-v1/${candidate}`,
      target: 'lynx' as const,
      candidate,
      support: 'supported' as const,
      expected: {
        statements: sorted(fixed.output ?? fixed.input).map(([property, value]) => ({ selector: `.${candidate}`, conditions: [], property, value, important: false })),
        diagnostics: [],
      },
    }]
  })
}
