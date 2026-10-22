import type { CssMapInput, CssRuleRef } from './diagnostics/input'
import type { CssSnapshot } from './diagnostics/origins'
import { collectCssRuleEvidence, cssSelectorDiagnosticMatches } from 'weapp-tailwindcss/core'
import { createEncodingInspector } from './diagnostics/evidence'
import { diagnosticGuidance } from './diagnostics/guidance'
import { flattenRules, isRecord, matchInput, parseRawDiagnostics } from './diagnostics/input'
import { mapCssOrigin } from './diagnostics/origins'
import { diagnosticVersions } from './diagnostics/versions'

export type LynxDiagnosticCategory = 'preflight' | 'tailwind-default' | 'business' | 'unknown'

export type LynxDiagnosticStatus = 'encoder-rejected' | 'bundled' | 'unknown'

export interface LynxDiagnosticIgnore {
  selector?: string | undefined
  property?: string | undefined
  reason?: string | undefined
}

export interface LynxCssDiagnostic {
  origin: 'encoder-log' | 'bundle-comparison'
  raw?: unknown
  ignored?: { reason: string, rule: LynxDiagnosticIgnore } | undefined
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
    generated?: { line?: number | undefined, column?: number | undefined } | undefined
  } | undefined
}

export interface LynxDiagnosticsReport {
  schemaVersion: 1
  counts: {
    generated: number
    encoderRejected: number
    unknown: number
  }
  evidence?: LynxEncodingEvidence | undefined
  diagnostics: LynxCssDiagnostic[]
  versionEvidence: { encoder: string, engine: string }
  versions: {
    encoder: string
    engine: string
    targetSdk?: string | undefined
  } | undefined
}

export interface LynxDiagnosticsOptions {
  /** 是否把确证的业务样式编码删除提升为构建错误。 */
  strict?: boolean | undefined
  /** 忽略匹配到的业务失败；诊断和忽略条件仍保留供报告消费方审计。 */
  ignore?: LynxDiagnosticIgnore[] | undefined
  /** 构建完成一个模板时接收结构化报告。 */
  onReport?: ((report: LynxDiagnosticsReport) => void) | undefined
}

export interface LynxEncodingEvidence {
  inputCssSha256?: string | undefined
  outputName?: string | undefined
  bundleSha256?: string | undefined
  decoderIdentity?: string | undefined
  decodedCssSha256?: string | undefined
  cssText?: string | undefined
  error?: string | undefined
}

function classifyRule(ref: CssRuleRef, classes: string[], property: string | undefined): LynxDiagnosticCategory {
  // 只识别纯默认组；业务选择器中的 --tw-* 不能掩盖其他声明的删除。
  const selector = ref.rule.selectorText?.value ?? ''
  if (classes.length > 0) {
    return 'business'
  }
  if (property?.startsWith('--tw-') && Object.keys(ref.rule.variables ?? {}).every(name => name.startsWith('--tw-'))
    && (ref.rule.style ?? []).every(declaration => declaration.name?.startsWith('--tw-'))) {
    return 'tailwind-default'
  }
  const defaults = ':root, :host, *, ::before, ::after, ::backdrop, ::file-selector-button'
  try {
    const branches = collectCssRuleEvidence(`${selector} { placeholder: 0; }`)
    if (branches.length && branches.every(branch => cssSelectorDiagnosticMatches(defaults, branch.selector))) {
      return 'preflight'
    }
  }
  catch { /* 无法证明为默认组时保留未知分类。 */ }
  return 'unknown'
}

function ignoredBy(diagnostic: LynxCssDiagnostic, ignores: LynxDiagnosticIgnore[] = []) {
  const rule = ignores.find(ignore => (ignore.selector || ignore.property)
    && (!ignore.selector || ignore.selector === diagnostic.selector)
    && (!ignore.property || ignore.property === diagnostic.property))
  return rule ? { reason: rule.reason ?? '按显式 selector/property 配置忽略失败；原诊断仍保留。', rule } : undefined
}

export function createLynxDiagnosticsReport(
  rawDiagnostics: unknown,
  css: unknown,
  options: LynxDiagnosticsOptions = {},
  compilerOptions?: Record<string, string | boolean> | undefined,
  evidence?: LynxEncodingEvidence | undefined,
  origins?: CssSnapshot | undefined,
  encoder?: { version?: string | undefined, source: string } | undefined,
): LynxDiagnosticsReport {
  const input = isRecord(css) ? css as CssMapInput : {}
  const rules = Object.entries(input.cssMap ?? {}).flatMap(([module, moduleRules]) => flattenRules(moduleRules, module))
  const inspector = createEncodingInspector(rules, evidence)
  const diagnostics: LynxCssDiagnostic[] = []
  const handled = new Map<CssRuleRef, Set<unknown> | 'selector'>()
  const seen = new Set<string>()
  for (const raw of parseRawDiagnostics(rawDiagnostics)) {
    const key = JSON.stringify(raw.raw)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const match = matchInput(rules, raw, input)
    let status: LynxDiagnosticStatus = 'unknown'
    let category: LynxDiagnosticCategory = 'unknown'
    let classes: string[] = []
    if (match) {
      if (raw.type === 'property' && handled.get(match.ref) !== 'selector') {
        const declarations = handled.get(match.ref) as Set<unknown> | undefined ?? new Set()
        declarations.add(match.declaration)
        handled.set(match.ref, declarations)
      }
      classes = inspector.classes(match.ref)
      status = inspector.status(match.ref, match.declaration)
      if (raw.type === 'selector' && status === 'encoder-rejected') {
        handled.set(match.ref, 'selector')
      }
      if (status !== 'unknown') {
        category = classifyRule(match.ref, classes, raw.type === 'property' ? raw.name : undefined)
      }
    }
    const origin = match ? mapCssOrigin(origins, match.ref.module, raw.line, raw.column) : undefined
    const diagnostic: LynxCssDiagnostic = {
      origin: 'encoder-log',
      raw: raw.raw,
      status,
      category,
      message: status === 'encoder-rejected'
        ? `encoder 产物确证删除 ${raw.type}：${raw.name}`
        : status === 'bundled' ? `encoder warning 对应规则仍保留：${raw.name}` : 'encoder 诊断缺少唯一输入关联或可信编码后证明。',
      ...(match
        ? {
            selector: match.ref.rule.selectorText?.value,
            utility: classes[0],
            property: raw.type === 'property' ? raw.name : undefined,
            value: match.declaration?.value,
          }
        : {}),
      source: { module: match?.ref.module ?? raw.module, file: origin?.file, line: origin?.line, column: origin?.column, generated: { line: raw.line, column: raw.column } },
      reason: status === 'unknown' ? evidence?.error ?? '来源歧义、未知日志或编码证据不足；不推断删除。' : undefined,
    }
    Object.assign(diagnostic, diagnosticGuidance(diagnostic))
    const ignored = ignoredBy(diagnostic, options.ignore)
    if (ignored) {
      diagnostic.ignored = ignored
    }
    diagnostics.push(diagnostic)
  }
  if (inspector.error && !diagnostics.some(item => item.status === 'unknown')) {
    diagnostics.push({
      origin: 'bundle-comparison',
      status: 'unknown',
      category: 'unknown',
      message: '本轮模板缺少可验证的完整编码后证据。',
      reason: inspector.error,
      suggestion: '先补齐本轮实际 bundle 的解码证据，再判断兼容性；当前不提供未经验证的样式替代。',
    })
  }
  // 某些 encoder 会静默丢弃属性；逐项保留删除证明及无法确证的业务声明。
  for (const ref of rules) {
    const classes = inspector.classes(ref)
    const covered = handled.get(ref)
    if (!classes.length || covered === 'selector') {
      continue
    }
    for (const declaration of ref.rule.style ?? []) {
      const status = inspector.status(ref, declaration)
      if (covered?.has(declaration) || status === 'bundled' || inspector.error) {
        continue
      }
      const location = declaration.keyLoc
      const origin = mapCssOrigin(origins, ref.module, location?.line, location?.column)
      const diagnostic: LynxCssDiagnostic = {
        origin: 'bundle-comparison',
        status,
        category: 'business',
        message: status === 'encoder-rejected' ? `编码输入声明在实际 bundle 中缺失：${declaration.name}` : `编码声明缺少独立等价证明：${declaration.name}`,
        reason: status === 'unknown' ? '来源歧义、重复声明或编码表示变化，尚无独立等价 oracle。' : undefined,
        selector: ref.rule.selectorText?.value,
        utility: classes[0],
        property: declaration.name,
        value: declaration.value,
        source: { module: ref.module, file: origin?.file, line: origin?.line, column: origin?.column, generated: location },
      }
      Object.assign(diagnostic, diagnosticGuidance(diagnostic))
      const ignored = ignoredBy(diagnostic, options.ignore)
      if (ignored) {
        diagnostic.ignored = ignored
      }
      diagnostics.push(diagnostic)
    }
  }
  const { cssText: _cssText, ...identity } = evidence ?? {}
  return {
    schemaVersion: 1,
    counts: {
      generated: rules.length,
      encoderRejected: diagnostics.filter(item => item.status === 'encoder-rejected').length,
      unknown: diagnostics.filter(item => item.status === 'unknown').length,
    },
    diagnostics,
    ...(evidence ? { evidence: identity } : {}),
    ...diagnosticVersions(compilerOptions, encoder),
  }
}

export function hasStrictLynxDiagnosticFailure(report: LynxDiagnosticsReport, options: LynxDiagnosticsOptions = {}) {
  return options.strict === true && report.diagnostics.some(item => item.status === 'encoder-rejected' && item.category === 'business' && !item.ignored)
}

export function formatLynxDiagnosticsSummary(report: LynxDiagnosticsReport) {
  return `Lynx CSS 诊断：生成 ${report.counts.generated} 条，encoder 删除 ${report.counts.encoderRejected} 条，未知 ${report.counts.unknown} 条。`
}
