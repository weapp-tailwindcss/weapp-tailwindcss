import { cssSelectorDiagnosticMatches } from '@weapp-tailwindcss/postcss/syntax'

export interface CssLocation { line?: number | undefined, column?: number | undefined }
export interface CssDeclaration {
  name?: string | undefined
  value?: string | undefined
  important?: boolean | undefined
  keyLoc?: CssLocation | undefined
  valLoc?: CssLocation | undefined
}
export interface CssRule {
  type?: string | undefined
  selectorText?: { value?: string | undefined, loc?: CssLocation | undefined } | undefined
  prelude?: { value?: string | undefined } | undefined
  style?: CssDeclaration[] | undefined
  variables?: Record<string, string> | undefined
  rules?: CssRule[] | undefined
}
export interface CssRuleRef { module: string, rule: CssRule, conditions: string[], uncertain: boolean }
export interface CssMapInput { cssMap?: Record<string, CssRule[]> | undefined, cssSource?: Record<string, string> | undefined }
export interface RawCssDiagnostic {
  type?: string | undefined
  name?: string | undefined
  module?: string | undefined
  file?: string | undefined
  line?: number | undefined
  column?: number | undefined
  raw: unknown
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
export function parseRawDiagnostics(value: unknown): RawCssDiagnostic[] {
  if (value === undefined || value === null || value === '') {
    return []
  }
  let parsed: unknown
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value
  }
  catch {
    return [{ raw: value }]
  }
  return (Array.isArray(parsed) ? parsed : [parsed]).map((raw: unknown) => {
    if (!isRecord(raw)) {
      return { raw }
    }
    const source = isRecord(raw.source) ? raw.source : {}
    return {
      raw,
      ...(typeof raw.type === 'string' ? { type: raw.type.toLowerCase() } : {}),
      ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
      ...(typeof raw.module === 'string' ? { module: raw.module } : {}),
      ...(typeof raw.file === 'string' ? { file: raw.file } : typeof source.file === 'string' ? { file: source.file } : {}),
      ...(Number.isSafeInteger(raw.line) && Number(raw.line) > 0 ? { line: Number(raw.line) } : {}),
      ...(Number.isSafeInteger(raw.column) && Number(raw.column) > 0 ? { column: Number(raw.column) } : {}),
    }
  })
}
export function flattenRules(rules: CssRule[] | undefined, module: string, conditions: string[] = [], uncertain = false): CssRuleRef[] {
  return (rules ?? []).flatMap((rule) => {
    const guard = rule.type === 'MediaRule' ? `@media ${rule.prelude?.value}` : undefined
    const next = guard ? [...conditions, guard] : conditions
    const unsupportedParent = uncertain || (rule.type !== 'StyleRule' && rule.type !== 'MediaRule')
    return [
      ...(rule.type === 'StyleRule' ? [{ module, rule, conditions, uncertain }] : []),
      ...flattenRules(rule.rules, module, next, unsupportedParent),
    ]
  })
}
function exactLocation(location: CssLocation | undefined, raw: RawCssDiagnostic) {
  return !!raw.line && !!raw.column && location?.line === raw.line && location?.column === raw.column
}
/** 只接受唯一、名称和位置同时匹配的输入；模块缺失不回退到其他入口。 */
export function matchInput(rules: CssRuleRef[], raw: RawCssDiagnostic, input: CssMapInput) {
  if (!raw.name || !['property', 'selector'].includes(raw.type ?? '')) {
    return undefined
  }
  const matches = rules.flatMap((ref) => {
    if (raw.module && raw.module !== ref.module && raw.module !== input.cssSource?.[ref.module]) {
      return []
    }
    if (raw.file && raw.file !== ref.module && raw.file !== input.cssSource?.[ref.module]) {
      return []
    }
    if (raw.type === 'property') {
      return (ref.rule.style ?? []).flatMap(declaration => declaration.name === raw.name
        && (exactLocation(declaration.keyLoc, raw) || exactLocation(declaration.valLoc, raw))
        ? [{ ref, declaration }]
        : [])
    }
    try {
      return ref.rule.selectorText?.value && cssSelectorDiagnosticMatches(ref.rule.selectorText.value, raw.name) && exactLocation(ref.rule.selectorText.loc, raw)
        ? [{ ref, declaration: undefined }]
        : []
    }
    catch {
      return []
    }
  })
  return matches.length === 1 ? matches[0] : undefined
}
