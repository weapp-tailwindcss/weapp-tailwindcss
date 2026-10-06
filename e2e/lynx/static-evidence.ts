import type { ExpectedDeclaration, StaticCaseEvidence, StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { compatibilityVersions, getCatalogHash, lynxIntermediateDir, readCssDefinesProperties } from './catalog'

interface EncodedDeclaration {
  name: string
  value: string
  important?: boolean
}

interface EncodedRule {
  type: string
  selectorText?: { value: string }
  style?: EncodedDeclaration[]
  variables?: Record<string, string>
  rules?: EncodedRule[]
}

interface TasmJson {
  css: {
    cssMap: Record<string, EncodedRule[]>
  }
}

interface RuleEvidence {
  selector: string
  declarations: ExpectedDeclaration[]
}

function escapeClassName(value: string) {
  return [...value].map((character, index) => {
    const code = character.codePointAt(0) ?? 0
    if ((code >= 48 && code <= 57 && index > 0) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || character === '-' || character === '_') {
      return character
    }
    return `\\${character}`
  }).join('')
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
  const selectors = candidates.map(candidate => `.${escapeClassName(candidate)}`)
  return rules.filter(rule => selectors.some(selector => rule.selector.includes(selector)))
}

function evaluateCase(rules: RuleEvidence[], item: typeof compatibilityCases[number], checkImportant: boolean) {
  const candidates = classCandidates(item.className)
  const matched = matchingRules(rules, candidates)
  const selectorMatches = candidates.length === 0 || candidates.every(candidate => (
    rules.some(rule => rule.selector.includes(`.${escapeClassName(candidate)}`))
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
    matched: selectorMatches && (item.declarations.length === 0 || declarations.length === item.declarations.length),
    declarations,
  }
}

function flattenEncodedRules(rules: EncodedRule[]): RuleEvidence[] {
  return rules.flatMap((rule) => {
    const nested = rule.rules ? flattenEncodedRules(rule.rules) : []
    if (rule.type !== 'StyleRule' || !rule.selectorText) {
      return nested
    }
    return [{
      selector: rule.selectorText.value,
      declarations: (rule.style ?? []).map(declaration => ({
        property: declaration.name,
        value: declaration.value,
        ...(declaration.important === true ? { important: true } : {}),
      })).concat(Object.entries(rule.variables ?? {}).map(([property, value]) => ({ property, value }))),
    }, ...nested]
  })
}

function parseGeneratedRules(css: string) {
  const rules: RuleEvidence[] = []
  postcss.parse(css).walkRules((rule) => {
    const declarations: ExpectedDeclaration[] = []
    rule.walkDecls((declaration) => {
      declarations.push({
        property: declaration.prop,
        value: declaration.value,
        ...(declaration.important ? { important: true } : {}),
      })
    })
    rules.push({ selector: rule.selector, declarations })
  })
  return rules
}

function parseEncoderRemovals(log: string) {
  return {
    properties: new Set([...log.matchAll(/Unsupported property "([^"]+)"/g)].map(match => match[1])),
    selectors: [...log.matchAll(/Unsupported selector "([^"]+)"/g)].map(match => match[1] ?? ''),
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
  const removals = parseEncoderRemovals(encoderLog)
  const results: StaticCaseEvidence[] = compatibilityCases.map((item) => {
    const generated = evaluateCase(generatedRules, item, true)
    const bundled = evaluateCase(bundledRules, item, false)
    const removedProperties = item.declarations.map(declaration => declaration.property).filter(property => removals.properties.has(property))
    const candidates = classCandidates(item.className).map(escapeClassName)
    const removedSelectors = removals.selectors.filter(selector => candidates.some(candidate => selector.includes(`.${candidate}`)))
    const encoderRemoved = removedProperties.length > 0 || removedSelectors.length > 0
    const isBundled = bundled.matched && !encoderRemoved
    const failureStage = !generated.matched ? 'generation' : !isBundled ? 'encoder' : undefined
    const reason = !generated.matched
      ? 'Tailwind 未生成完整 selector 或声明'
      : removedProperties.length > 0
        ? `encoder 删除属性：${removedProperties.join(', ')}`
        : removedSelectors.length > 0
          ? `encoder 删除 selector：${removedSelectors.join(', ')}`
          : !bundled.matched ? 'TASM 未保留完整 selector 或声明' : undefined
    return {
      id: item.id,
      generated: generated.matched,
      bundled: isBundled,
      ...(failureStage ? { failureStage } : {}),
      ...(reason ? { reason } : {}),
      generatedDeclarations: generated.declarations,
      bundledDeclarations: bundled.declarations,
      cssDefinesKnown: item.declarations.map(declaration => declaration.property).filter(property => cssDefinesProperties.has(property)),
    }
  })
  return {
    schemaVersion: 1,
    catalogHash: getCatalogHash(),
    generatedAt,
    versions: compatibilityVersions,
    results,
  }
}
