export type LynxDiagnosticCategory = 'preflight' | 'tailwind-default' | 'business' | 'unknown'

export type LynxDiagnosticStatus = 'encoder-rejected' | 'unknown'

export interface LynxDiagnosticIgnore {
  selector?: string | undefined
  property?: string | undefined
  reason?: string | undefined
}

export interface LynxCssDiagnostic {
  status: LynxDiagnosticStatus
  category: LynxDiagnosticCategory
  message: string
  selector?: string | undefined
  utility?: string | undefined
  property?: string | undefined
  value?: string | undefined
  reason?: string | undefined
  suggestion?: string | undefined
  source?: {
    module?: string | undefined
    file?: string | undefined
    line?: number | undefined
    column?: number | undefined
  } | undefined
}

export interface LynxDiagnosticsReport {
  schemaVersion: 1
  counts: {
    generated: number
    encoderRejected: number
    unknown: number
  }
  diagnostics: LynxCssDiagnostic[]
  versions?: {
    encoder?: string | undefined
    engine?: string | undefined
    targetSdk?: string | undefined
  } | undefined
}

export interface LynxDiagnosticsOptions {
  /** 是否把确证的业务样式编码删除提升为构建错误。 */
  strict?: boolean | undefined
  /** 忽略匹配到的业务诊断，并保留忽略条件供报告消费方审计。 */
  ignore?: LynxDiagnosticIgnore[] | undefined
  /** 构建完成一个模板时接收结构化报告。 */
  onReport?: ((report: LynxDiagnosticsReport) => void) | undefined
}

interface RawCssDiagnostic {
  type?: string | undefined
  name?: string | undefined
  module?: string | undefined
  file?: string | undefined
  line: number
  column: number
}

interface CssLocation {
  line?: number | undefined
  column?: number | undefined
}

interface CssDeclaration {
  name?: string | undefined
  value?: string | undefined
  keyLoc?: CssLocation | undefined
  valLoc?: CssLocation | undefined
}

interface CssRule {
  type?: string | undefined
  selectorText?: { value?: string | undefined, loc?: CssLocation | undefined } | undefined
  style?: CssDeclaration[] | undefined
  variables?: Record<string, string> | undefined
  rules?: CssRule[] | undefined
}

interface CssRuleRef {
  module: string
  rule: CssRule
}

interface CssMapInput {
  cssMap?: Record<string, CssRule[]> | undefined
  cssSource?: Record<string, string> | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function parseRawDiagnostics(value: unknown): { diagnostics: RawCssDiagnostic[], malformed: boolean } {
  if (value === undefined || value === null || value === '') {
    return { diagnostics: [], malformed: false }
  }
  if (typeof value !== 'string') {
    return { diagnostics: [], malformed: true }
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return { diagnostics: [], malformed: true }
    }
    const diagnostics = parsed.flatMap((item: unknown): RawCssDiagnostic[] => {
      if (!isRecord(item) || typeof item.line !== 'number' || typeof item.column !== 'number') {
        return []
      }
      const source = isRecord(item.source) ? item.source : undefined
      return [{
        ...(typeof item.type === 'string' ? { type: item.type } : {}),
        ...(typeof item.name === 'string' ? { name: item.name } : {}),
        ...(typeof item.module === 'string' ? { module: item.module } : {}),
        ...(typeof item.file === 'string'
          ? { file: item.file }
          : typeof source?.file === 'string' ? { file: source.file } : {}),
        line: item.line,
        column: item.column,
      }]
    })
    return { diagnostics, malformed: diagnostics.length !== parsed.length }
  }
  catch {
    return { diagnostics: [], malformed: true }
  }
}

function flattenRules(rules: CssRule[] | undefined, module: string): CssRuleRef[] {
  return (rules ?? []).flatMap(rule => [
    ...(rule.type === 'StyleRule' ? [{ module, rule }] : []),
    ...flattenRules(rule.rules, module),
  ])
}

function locationScore(location: CssLocation | undefined, diagnostic: RawCssDiagnostic) {
  if (!location?.line || !location.column) {
    return Number.POSITIVE_INFINITY
  }
  return Math.abs(location.line - diagnostic.line) * 1000 + Math.abs(location.column - diagnostic.column)
}

function classNameFromSelector(selector: string | undefined) {
  if (!selector) {
    return undefined
  }
  const match = selector.match(/\.((?:\\.|[\w-])+)/)
  return match?.[1]?.replaceAll('\\', '')
}

function isPreflightSelector(selector: string | undefined) {
  return !!selector && /(?:^|[,\s])(?::root|:host|:where\(|\*|::file-selector-button)/.test(selector)
}

function isTailwindDefaultRule(rule: CssRule, selector: string | undefined) {
  if (selector?.includes('::backdrop')) {
    return true
  }
  return (rule.style ?? []).some(declaration => declaration.name?.startsWith('--tw-'))
    || Object.keys(rule.variables ?? {}).some(property => property.startsWith('--tw-'))
}

function classifyRule(rule: CssRule | undefined, selector: string | undefined): LynxDiagnosticCategory {
  if (!rule || !selector) {
    return 'unknown'
  }
  if (isPreflightSelector(selector)) {
    return 'preflight'
  }
  if (isTailwindDefaultRule(rule, selector)) {
    return 'tailwind-default'
  }
  return selector.includes('.') ? 'business' : 'unknown'
}

function findRule(rules: CssRuleRef[], diagnostic: RawCssDiagnostic) {
  const scopedRules = diagnostic.module || diagnostic.file
    ? rules.filter(({ module }) => module === diagnostic.module || module === diagnostic.file)
    : rules
  const candidates = scopedRules.length > 0 ? scopedRules : rules
  const namedRules = candidates.filter(({ rule }) => {
    const selector = rule.selectorText?.value
    const propertyMatch = diagnostic.type?.toLowerCase() === 'property'
      ? (rule.style ?? []).some(declaration => declaration.name === diagnostic.name)
      : true
    const nameMatch = diagnostic.type?.toLowerCase() === 'selector'
      ? !!diagnostic.name && selector?.includes(diagnostic.name)
      : true
    return propertyMatch && nameMatch
  })
  return [...(namedRules.length > 0 ? namedRules : candidates)].sort((left, right) => {
    const leftRule = left.rule
    const rightRule = right.rule
    const leftLocation = diagnostic.type?.toLowerCase() === 'property'
      ? leftRule.style?.find(declaration => declaration.name === diagnostic.name)?.keyLoc
      : leftRule.selectorText?.loc
    const rightLocation = diagnostic.type?.toLowerCase() === 'property'
      ? rightRule.style?.find(declaration => declaration.name === diagnostic.name)?.keyLoc
      : rightRule.selectorText?.loc
    return locationScore(leftLocation, diagnostic) - locationScore(rightLocation, diagnostic)
  })[0]
}

function findDeclaration(rule: CssRule | undefined, diagnostic: RawCssDiagnostic) {
  return rule?.style?.filter(declaration => !diagnostic.name || declaration.name === diagnostic.name)
    .sort((left, right) => locationScore(left.keyLoc, diagnostic) - locationScore(right.keyLoc, diagnostic))[0]
}

function suggestionFor(property: string | undefined) {
  if (!property) {
    return '保留原始 encoder 诊断，并核对当前 Lynx 支持矩阵。'
  }
  return `请核对 Lynx encoder 对 ${property} 的支持，并为业务规则提供兼容写法。`
}

function isIgnored(diagnostic: LynxCssDiagnostic, ignores: LynxDiagnosticIgnore[] | undefined) {
  return ignores?.some((ignore) => {
    return (!ignore.selector || ignore.selector === diagnostic.selector)
      && (!ignore.property || ignore.property === diagnostic.property)
      && (!ignore.reason || diagnostic.message.includes(ignore.reason))
  }) ?? false
}

function createUnknownDiagnostic(message: string): LynxCssDiagnostic {
  return {
    status: 'unknown',
    category: 'unknown',
    message,
    reason: '无法解析当前模板插件提供的 CSS 诊断格式。',
  }
}

function diagnosticKey(diagnostic: LynxCssDiagnostic) {
  return JSON.stringify([
    diagnostic.status,
    diagnostic.category,
    diagnostic.selector,
    diagnostic.utility,
    diagnostic.property,
    diagnostic.value,
    diagnostic.reason,
    diagnostic.source?.module,
    diagnostic.source?.file,
    diagnostic.source?.line,
    diagnostic.source?.column,
  ])
}

export function createLynxDiagnosticsReport(
  rawDiagnostics: unknown,
  css: unknown,
  options: LynxDiagnosticsOptions = {},
  compilerOptions?: Record<string, string | boolean> | undefined,
): LynxDiagnosticsReport {
  const input = isRecord(css) ? css as CssMapInput : {}
  const rules = Object.entries(input.cssMap ?? {}).flatMap(([module, moduleRules]) => flattenRules(moduleRules, module))
  const parsed = parseRawDiagnostics(rawDiagnostics)
  const diagnostics: LynxCssDiagnostic[] = []

  if (parsed.malformed) {
    diagnostics.push(createUnknownDiagnostic('Lynx encoder 返回了无法解析的 CSS 诊断。'))
  }

  const seenRaw = new Set<string>()
  for (const raw of parsed.diagnostics) {
    const rawKey = JSON.stringify([raw.type, raw.name, raw.module, raw.file, raw.line, raw.column])
    if (seenRaw.has(rawKey)) {
      continue
    }
    seenRaw.add(rawKey)
    const ruleRef = findRule(rules, raw)
    const rule = ruleRef?.rule
    const selector = rule?.selectorText?.value
    const declaration = findDeclaration(rule, raw)
    const property = raw.type?.toLowerCase() === 'property' ? raw.name : declaration?.name
    const category = classifyRule(rule, selector)
    const diagnostic: LynxCssDiagnostic = {
      status: 'encoder-rejected',
      category,
      message: raw.name
        ? `Unsupported ${raw.type ?? 'CSS syntax'} "${raw.name}" was removed during template encode.`
        : `Unsupported ${raw.type ?? 'CSS syntax'} was removed during template encode.`,
      ...(selector ? { selector } : {}),
      ...(classNameFromSelector(selector) ? { utility: classNameFromSelector(selector) } : {}),
      ...(property ? { property } : {}),
      ...(declaration?.value ? { value: declaration.value } : {}),
      reason: raw.name ? `encoder 删除 ${raw.type ?? 'CSS syntax'}：${raw.name}` : 'encoder 删除了未命名 CSS 结构。',
      suggestion: suggestionFor(property),
      source: {
        ...(raw.module || ruleRef?.module ? { module: raw.module ?? ruleRef?.module } : {}),
        ...(raw.file ? { file: raw.file } : {}),
        line: raw.line,
        column: raw.column,
      },
    }
    if (!isIgnored(diagnostic, options.ignore)) {
      if (!diagnostics.some(existing => diagnosticKey(existing) === diagnosticKey(diagnostic))) {
        diagnostics.push(diagnostic)
      }
    }
  }

  const encoderRejected = diagnostics.filter(item => item.status === 'encoder-rejected').length
  const unknown = diagnostics.filter(item => item.status === 'unknown').length
  return {
    schemaVersion: 1,
    counts: {
      generated: rules.length,
      encoderRejected,
      unknown,
    },
    diagnostics,
    ...(compilerOptions
      ? {
          versions: {
            ...(typeof compilerOptions.engineVersion === 'string' ? { engine: compilerOptions.engineVersion } : {}),
            ...(typeof compilerOptions.targetSdkVersion === 'string' ? { targetSdk: compilerOptions.targetSdkVersion } : {}),
            ...(typeof compilerOptions.encoderVersion === 'string' ? { encoder: compilerOptions.encoderVersion } : {}),
          },
        }
      : {}),
  }
}

export function hasStrictLynxDiagnosticFailure(report: LynxDiagnosticsReport, options: LynxDiagnosticsOptions = {}) {
  return options.strict === true && report.diagnostics.some(item => item.status === 'encoder-rejected' && item.category === 'business')
}

export function formatLynxDiagnosticsSummary(report: LynxDiagnosticsReport) {
  return `Lynx CSS 诊断：生成 ${report.counts.generated} 条，encoder 删除 ${report.counts.encoderRejected} 条，未知 ${report.counts.unknown} 条。`
}
