import type { LynxDiagnosticStatus, LynxEncodingEvidence } from '../diagnostics'
import type { CssDeclaration, CssRuleRef } from './input'
import { collectCssRuleEvidence } from 'weapp-tailwindcss/core'

type Branch = ReturnType<typeof collectCssRuleEvidence>[number]
const guardKey = (conditions: string[]) => JSON.stringify(conditions.map(condition => condition.trim()))
const branchKey = (branch: Branch, conditions = branch.conditions) => JSON.stringify([branch.identity, guardKey(conditions)])

function mayRepresent(property: string, actual: string) {
  if (property === 'all') {
    return true
  }
  const plain = (name: string) => name.replace(/^-(?:webkit|moz|ms|o)-/, '')
  if (plain(property) === plain(actual)) {
    return true
  }
  if (actual.startsWith(`${property}-`) || property.startsWith(`${actual}-`)) {
    return true
  }
  const groups = [
    ['border-', 'border-'],
    ['gap', 'grid-gap', 'row-gap', 'column-gap', 'grid-row-gap', 'grid-column-gap'],
    ['columns', 'column-width', 'column-count'],
    ['word-wrap', 'overflow-wrap'],
    ['inset', 'top', 'right', 'bottom', 'left'],
    ['padding-inline', 'padding-left', 'padding-right'],
    ['padding-block', 'padding-top', 'padding-bottom'],
    ['margin-inline', 'margin-left', 'margin-right'],
    ['margin-block', 'margin-top', 'margin-bottom'],
    ['place-items', 'align-items', 'justify-items'],
    ['place-content', 'align-content', 'justify-content'],
    ['place-self', 'align-self', 'justify-self'],
  ]
  return groups.some(group => group.some(name => name.endsWith('-') ? property.startsWith(name) : property === name)
    && group.some(name => name.endsWith('-') ? actual.startsWith(name) : actual === name))
}

/** 每个模板只解析一次完整产物和输入分支，避免 warning 数量放大解析开销。 */
export function createEncodingInspector(rules: CssRuleRef[], evidence?: LynxEncodingEvidence) {
  const sources = new Map<CssRuleRef, Branch[]>()
  const owners = new Map<string, Set<CssRuleRef>>()
  for (const ref of rules) {
    try {
      const branches = collectCssRuleEvidence(`${ref.rule.selectorText?.value} { placeholder: 0; }`)
      sources.set(ref, branches)
      for (const branch of branches) {
        const key = branchKey(branch, ref.conditions)
        const refs = owners.get(key) ?? new Set()
        refs.add(ref)
        owners.set(key, refs)
      }
    }
    catch {
      /* 无法解析的输入没有可信分支身份。 */
    }
  }
  const output = new Map<string, Branch[]>()
  const outputClasses = new Set<string>()
  let verified = false
  let error: string | undefined = evidence?.error ?? '缺少本轮 bundle 身份或完整 decoder 文本。'
  if (evidence?.cssText !== undefined && evidence.bundleSha256 && evidence.decoderIdentity) {
    try {
      const bundled = collectCssRuleEvidence(evidence.cssText.replace(/\{\{(--[a-z0-9-]+)\}\}/gi, 'var($1)'))
      for (const branch of bundled) {
        const key = branchKey(branch)
        output.set(key, [...(output.get(key) ?? []), branch])
        branch.classes.forEach(name => outputClasses.add(name))
      }
      verified = true
      error = undefined
    }
    catch {
      /* 解码文本无法完整解析时，任何 warning 都不能证明删除。 */
    }
  }
  return {
    error,
    classes: (ref: CssRuleRef) => sources.get(ref)?.flatMap(branch => branch.classes) ?? [],
    status(ref: CssRuleRef, declaration?: CssDeclaration): LynxDiagnosticStatus {
      const branches = sources.get(ref)
      if (!verified || ref.uncertain || !branches?.length) {
        return 'unknown'
      }
      if (branches.some(branch => owners.get(branchKey(branch, ref.conditions))?.size !== 1)) {
        return 'unknown'
      }
      let expected: { value: string, important: boolean } | undefined
      if (declaration) {
        if ((ref.rule.style ?? []).filter(item => item.name === declaration.name).length !== 1) {
          return 'unknown'
        }
        try {
          // serializer 把 !important 放入 value；同时兼容显式 important 标记。
          const parsed = collectCssRuleEvidence(`.input { value: ${declaration.value}; }`)[0]?.declarations
          if (parsed?.length !== 1 || parsed[0]?.property !== 'value') {
            return 'unknown'
          }
          expected = { value: parsed[0].value, important: !!declaration.important || parsed[0].important }
        }
        catch {
          return 'unknown'
        }
      }
      const states = branches.map((branch): LynxDiagnosticStatus => {
        const matches = output.get(branchKey(branch, ref.conditions)) ?? []
        if (!matches.length) {
          // 同类的其他表示或条件可能承载该规则，不能把缺少原分支当作删除。
          return branch.classes.some(name => outputClasses.has(name)) ? 'unknown' : 'encoder-rejected'
        }
        if (!declaration) {
          return 'bundled'
        }
        const declarations = matches.flatMap(item => item.declarations).filter(item => item.property === declaration.name)
        if (!declarations.length) {
          // 已知可能展开或别名化的属性必须交给独立等价 oracle，不能仅凭原名消失判删除。
          return matches.some(item => item.declarations.some(other => mayRepresent(declaration.name ?? '', other.property))) ? 'unknown' : 'encoder-rejected'
        }
        if (declarations.length !== 1) {
          return 'unknown'
        }
        return declarations[0]?.value === expected?.value && declarations[0]?.important === expected?.important ? 'bundled' : 'unknown'
      })
      if (states.includes('encoder-rejected')) {
        return 'encoder-rejected'
      }
      return states.every(state => state === 'bundled') ? 'bundled' : 'unknown'
    },
  }
}
