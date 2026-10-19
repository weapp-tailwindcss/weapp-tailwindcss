import type { ExpectedDeclaration, StaticCaseEvidence, StaticEvidenceReport, StaticMediaGuardEvidence } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { MEDIA_GATE_CANDIDATES, MEDIA_GATE_LIMITATION_ID, MEDIA_GATE_SOURCE_SHA256 } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { walkClasses } from '../../packages/postcss/src/compat/native/selectors'
import { compatibilityVersions, getCatalogHash, lynxIntermediateDir, readCssDefinesProperties } from './catalog'

interface EncodedDeclaration {
  name: string
  value: string
  important?: boolean
}

export interface EncodedRule {
  type: string
  selectorText?: { value: string }
  style?: EncodedDeclaration[]
  variables?: Record<string, string>
  rules?: EncodedRule[]
  prelude?: { value: string }
}

interface TasmJson {
  css: {
    cssMap: Record<string, EncodedRule[]>
  }
}

export interface RuleEvidence {
  selector: string
  declarations: ExpectedDeclaration[]
  mediaConditions?: string[]
}

function classCandidates(className: string) {
  return className.trim().split(/\s+/).filter(Boolean)
}

function normalizeDeclarationValue(value: string, property: string) {
  const normalized = value
    .trim()
    .replace(/\{\{(--[a-z0-9-]+)\}\}/gi, 'var($1)')
    .replace(/\s+/g, ' ')
  // opacity 的 50% 和 0.5 是等价期望；50 与 50% 不等价，不能只比较去单位文本。
  if (property === 'opacity' && /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?%?$/i.test(normalized)) {
    const number = normalized.endsWith('%') ? Number(normalized.slice(0, -1)) / 100 : Number(normalized)
    if (Number.isFinite(number)) {
      return String(number)
    }
  }
  return normalized
}

export function declarationMatches(actual: ExpectedDeclaration, expected: ExpectedDeclaration, checkImportant: boolean) {
  return actual.property === expected.property
    && (expected.value === undefined || (actual.value !== undefined && normalizeDeclarationValue(actual.value, actual.property) === normalizeDeclarationValue(expected.value, expected.property)))
    && (!checkImportant || expected.important !== true || actual.important === true)
}

function matchingRules(rules: RuleEvidence[], candidates: string[]) {
  if (candidates.length === 0) {
    return rules
  }
  return rules.filter(rule => candidates.some(candidate => selectorHasCandidate(rule.selector, candidate)))
}

/** 复用 CSS AST 的 class 语义，等价转义不能漏掉替代分支，属性字面量不能冒充 class。 */
export function selectorHasCandidate(selector: string, candidate: string) {
  return walkClasses(selector).includes(candidate)
}

export function evaluateCase(rules: RuleEvidence[], item: typeof compatibilityCases[number], checkImportant: boolean) {
  const candidates = classCandidates(item.className)
  const matched = matchingRules(rules, candidates)
  const selectorMatches = candidates.length === 0 || candidates.every(candidate => (
    rules.some(rule => selectorHasCandidate(rule.selector, candidate))
  ))
  const declarations = item.declarations.flatMap((expected) => {
    const actual = matched
      .flatMap(rule => rule.declarations)
      .find(declaration => declarationMatches(declaration, expected, checkImportant))
    if (!actual) {
      return []
    }
    return [{
      property: actual.property,
      ...(actual.value === undefined ? {} : { value: actual.value }),
      ...(actual.important === true ? { important: true } : {}),
    }]
  })
  return {
    matched: rules.length > 0 && selectorMatches && (item.declarations.length === 0 || declarations.length === item.declarations.length),
    declarations,
  }
}

export function flattenEncodedRules(rules: EncodedRule[], ancestors: string[] = []): RuleEvidence[] {
  return rules.flatMap((rule) => {
    const conditions = rule.type === 'MediaRule' ? [...ancestors, rule.prelude?.value.replace(/\s+/g, '') ?? 'unknown-media'] : ancestors
    const nested = rule.rules ? flattenEncodedRules(rule.rules, conditions) : []
    if (rule.type !== 'StyleRule' || !rule.selectorText) {
      return nested
    }
    return [{
      selector: rule.selectorText.value,
      mediaConditions: [...conditions],
      declarations: (rule.style ?? []).map(declaration => ({
        property: declaration.name,
        value: declaration.value,
        ...(declaration.important === true ? { important: true } : {}),
      })).concat(Object.entries(rule.variables ?? {}).map(([property, value]) => ({ property, value }))),
    }, ...nested]
  })
}

export function parseGeneratedRules(css: string) {
  const rules: RuleEvidence[] = []
  postcss.parse(css).walkRules((rule) => {
    const mediaConditions: string[] = []
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media') {
        mediaConditions.unshift(parent.params.replace(/\s+/g, ''))
      }
    }
    const declarations: ExpectedDeclaration[] = []
    rule.walkDecls((declaration) => {
      declarations.push({
        property: declaration.prop,
        value: declaration.value,
        ...(declaration.important ? { important: true } : {}),
      })
    })
    rules.push({ selector: rule.selector, declarations, mediaConditions })
  })
  return rules
}

/** 所有生成与编码规则都必须具有必要 guard；任一无条件替代规则都拒绝该限制证明。 */
export function staticMediaGuard(className: string, generated: RuleEvidence[], bundled: RuleEvidence[]): StaticMediaGuardEvidence | undefined {
  if (!(MEDIA_GATE_CANDIDATES as readonly string[]).includes(className)) {
    return undefined
  }
  const sources = [generated, bundled].map(rules => matchingRules(rules, [className]))
  if (sources.some(rules => rules.length === 0 || rules.some(rule => !rule.mediaConditions?.includes('(hover:hover)')))) {
    return undefined
  }
  const [generatedRules, bundledRules] = sources.map(rules => rules.map(rule => ({ selector: rule.selector, mediaConditions: rule.mediaConditions! })))
  return { className, limitationId: MEDIA_GATE_LIMITATION_ID, sourceSha256: MEDIA_GATE_SOURCE_SHA256, condition: '(hover:hover)', generatedRules: generatedRules!, bundledRules: bundledRules! }
}

function parseEncoderRemovals(log: string) {
  return {
    properties: new Set([...log.matchAll(/Unsupported property "([^"]+)"/g)].map(match => match[1])),
    selectors: [...log.matchAll(/Unsupported selector "([^"]+)"/g)].map(match => match[1] ?? ''),
  }
}

/** 同组候选逐项保留，生成型指令的成功与 encoder 保留相互独立。 */
export function analyzeStaticCase(
  item: typeof compatibilityCases[number],
  generatedRules: RuleEvidence[],
  bundledRules: RuleEvidence[],
  encoderLog = '',
  cssDefinesProperties = new Set<string>(),
): StaticCaseEvidence {
  const generated = evaluateCase(generatedRules, item, true)
  const bundled = evaluateCase(bundledRules, item, false)
  const removals = parseEncoderRemovals(encoderLog)
  const candidates = classCandidates(item.className).map((className) => {
    const ownGenerated = matchingRules(generatedRules, [className])
    const declarations = item.declarations.filter(expected => ownGenerated.some(rule => (
      rule.declarations.some(actual => declarationMatches(actual, expected, true))
    )))
    const candidate = { ...item, className, declarations }
    const candidateGenerated = evaluateCase(generatedRules, candidate, true).matched
    const candidateBundled = evaluateCase(bundledRules, candidate, false).matched
    const removedProperties = declarations.filter(declaration => removals.properties.has(declaration.property)).map(declaration => declaration.property)
    const removedSelectors = removals.selectors.filter(selector => selectorHasCandidate(selector, className))
    const retained = candidateGenerated && candidateBundled && removedProperties.length === 0 && removedSelectors.length === 0
    const mediaGuard = retained ? staticMediaGuard(className, generatedRules, bundledRules) : undefined
    const failureStage = !candidateGenerated ? 'generation' : !retained ? 'encoder' : undefined
    const reason = !candidateGenerated
      ? 'Tailwind 未生成候选 selector'
      : removedProperties.length > 0
        ? `encoder 删除属性：${removedProperties.join(', ')}`
        : removedSelectors.length > 0
          ? `encoder 删除 selector：${removedSelectors.join(', ')}`
          : !candidateBundled ? 'TASM 未保留该候选的完整 selector 或声明' : undefined
    return {
      className,
      generated: candidateGenerated,
      bundled: retained,
      ...(failureStage ? { failureStage: failureStage as 'generation' | 'encoder' } : {}),
      ...(reason ? { reason } : {}),
      ...(mediaGuard ? { mediaGuard } : {}),
    }
  })
  const isBundled = generated.matched && bundled.matched && candidates.every(candidate => candidate.bundled)
  const failureStage = !generated.matched ? 'generation' : !isBundled ? 'encoder' : undefined
  return {
    id: item.id,
    generated: generated.matched,
    bundled: isBundled,
    ...(failureStage ? { failureStage } : {}),
    ...(!generated.matched
      ? { reason: 'Tailwind 未生成完整 selector 或声明' }
      : !isBundled ? { reason: candidates.filter(candidate => !candidate.bundled).map(candidate => `${candidate.className}: ${candidate.reason}`).join('; ') || 'TASM 未保留完整 selector 或声明' } : {}),
    generatedDeclarations: generated.declarations,
    bundledDeclarations: bundled.declarations,
    cssDefinesKnown: item.declarations.map(declaration => declaration.property).filter(property => cssDefinesProperties.has(property)),
    candidates,
  }
}

export async function analyzeStaticEvidence(generatedAt = new Date().toISOString(), encoderLog = ''): Promise<StaticEvidenceReport> {
  const generatedCssPath = path.join(lynxIntermediateDir, 'main.css')
  const tasmPath = path.join(lynxIntermediateDir, 'tasm.json')
  const [generatedCss, tasmSource, cssDefinesProperties] = await Promise.all([
    fs.readFile(generatedCssPath, 'utf8'),
    fs.readFile(tasmPath, 'utf8'),
    readCssDefinesProperties(),
  ])
  const generatedRules = parseGeneratedRules(generatedCss)
  const tasm = JSON.parse(tasmSource) as TasmJson
  const bundledRules = flattenEncodedRules(Object.values(tasm.css.cssMap).flat())
  const results = compatibilityCases.map(item => analyzeStaticCase(item, generatedRules, bundledRules, encoderLog, cssDefinesProperties))
  return {
    schemaVersion: 1,
    catalogHash: getCatalogHash(),
    generatedAt,
    versions: compatibilityVersions,
    results,
  }
}
