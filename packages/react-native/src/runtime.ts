/* eslint-disable style/max-statements-per-line */

import type { NativeClassValue, NativeStyleEnvironment, NativeStyleRuntime, NativeStyleValue } from './runtime/types'
import type { NativePlatform, NativeStyleManifest, NativeStyleRule } from './types'

interface StyleValue { [key: string]: unknown }
interface StyleMeta { important: NativeStyleValue }
type StyleSheetFactory = (value: Record<string, StyleValue>) => Record<string, NativeStyleValue>

let activeManifest: NativeStyleManifest | undefined
let activeEnvironment: NativeStyleEnvironment = {}
const styleMetadata = new Map<unknown, StyleMeta>()
let styleSheetFactory: StyleSheetFactory | undefined
let nativeStyleSheet: Record<string, NativeStyleValue> = {}

function createStyleSheet(manifest: NativeStyleManifest) {
  const source = manifest.styleSheet ?? Object.fromEntries(
    Object.entries(manifest.styleEntries ?? {}).map(([id, rule]) => [id, rule.style]),
  )
  nativeStyleSheet = styleSheetFactory?.(source) ?? source
}

function flatten(value: NativeClassValue, result: string[]) {
  if (!value) { return }
  if (typeof value === 'string') {
    result.push(...value.split(/\s+/).filter(Boolean))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) { flatten(item, result) }
    return
  }
  for (const [className, enabled] of Object.entries(value)) {
    if (enabled) { result.push(className) }
  }
}

function canonicalTokens(value: NativeClassValue) {
  const tokens: string[] = []
  flatten(value, tokens)
  return [...new Set(tokens)].sort()
}

function matches(rule: NativeStyleRule, environment: NativeStyleEnvironment) {
  if (rule.colorScheme && rule.colorScheme !== environment.colorScheme) { return false }
  if (!rule.platform) { return true }
  if (rule.platform === 'native') { return environment.platform !== 'web' }
  return rule.platform === environment.platform
}

function resolveRules(ids: readonly string[], manifest: NativeStyleManifest | undefined, environment: NativeStyleEnvironment) {
  const normal: Array<{ rule: NativeStyleRule, id: string }> = []
  const important: Array<{ rule: NativeStyleRule, id: string }> = []
  for (const id of ids) {
    const rule = manifest?.styleEntries?.[id]
    if (rule) {
      if (!matches(rule, environment)) { continue }
      ;(rule.important ? important : normal).push({ rule, id })
      continue
    }
    // 显式 Babel plugin 没有拿到 ID map 时，token 本身仍可作为静态 lookup key。
    const fallbackIds = manifest?.staticLookup?.[id] ?? []
    if (fallbackIds.length) {
      for (const fallbackId of fallbackIds) {
        const fallbackRule = manifest?.styleEntries?.[fallbackId]
        if (!fallbackRule || !matches(fallbackRule, environment)) { continue }
        ;(fallbackRule.important ? important : normal).push({ rule: fallbackRule, id: fallbackId })
      }
    }
    else {
      for (const fallbackRule of manifest?.rules?.[id] ?? []) {
        if (!matches(fallbackRule, environment)) { continue }
        ;(fallbackRule.important ? important : normal).push({ rule: fallbackRule, id })
      }
    }
  }
  const order = (left: { rule: NativeStyleRule }, right: { rule: NativeStyleRule }) => (left.rule.order ?? 0) - (right.rule.order ?? 0)
  normal.sort(order)
  important.sort(order)
  const style: StyleValue = {}
  const importantStyle: StyleValue = {}
  for (const { rule } of normal) { Object.assign(style, rule.style) }
  for (const { rule } of important) { Object.assign(style, rule.style); Object.assign(importantStyle, rule.style) }
  const normalIds = normal.map(item => item.id)
  const importantIds = important.map(item => item.id)
  const asStyleValue = (ids: string[], fallback: StyleValue): NativeStyleValue => {
    if (!styleSheetFactory) { return fallback }
    const values = ids.map(id => nativeStyleSheet[id]).filter(value => value !== undefined)
    if (values.length === 1) { return values[0] }
    if (values.length > 1) { return values }
    return fallback
  }
  return {
    style,
    importantStyle,
    styleValue: asStyleValue(normalIds, style),
    importantValue: asStyleValue(importantIds, importantStyle),
  }
}

function resolveDynamic(value: NativeClassValue, manifest: NativeStyleManifest | undefined, environment: NativeStyleEnvironment) {
  const classNames = canonicalTokens(value)
  const ids = manifest?.staticLookup
    ? classNames.flatMap(className => manifest.staticLookup?.[className] ?? [])
    : classNames
  return resolveRules(ids, manifest, environment)
}

function rememberStyle(style: NativeStyleValue, importantStyle: NativeStyleValue) {
  if (importantStyle && (typeof importantStyle !== 'object' || Object.keys(importantStyle).length)) { styleMetadata.set(style, { important: importantStyle }) }
  return style
}

export function createNativeStyleRuntime(initialManifest?: NativeStyleManifest): NativeStyleRuntime {
  let manifest = initialManifest
  let environment = activeEnvironment
  const cache = new Map<string, NativeStyleValue>()
  const runtime: NativeStyleRuntime = {
    tw(value, requestedEnvironment = {}) {
      const effectiveEnvironment = { ...environment, ...requestedEnvironment }
      const tokens = canonicalTokens(value)
      const key = `${tokens.join('\u0001')}|${effectiveEnvironment.colorScheme ?? ''}|${effectiveEnvironment.platform ?? ''}`
      const cached = cache.get(key)
      if (cached) { return cached }
      const resolved = resolveDynamic(value, manifest, effectiveEnvironment)
      const style = rememberStyle(resolved.styleValue, resolved.importantValue)
      cache.set(key, style)
      return style
    },
    getStaticStyle(ids, requestedEnvironment = {}) {
      const effectiveEnvironment = { ...environment, ...requestedEnvironment }
      const resolved = resolveRules(ids, manifest, effectiveEnvironment)
      return rememberStyle(resolved.styleValue, resolved.importantValue)
    },
    composeStyle(tailwindStyle, inlineStyle) {
      const important = styleMetadata.get(tailwindStyle)?.important
      return important !== undefined
        ? [tailwindStyle, inlineStyle, important]
        : [tailwindStyle, inlineStyle]
    },
    setManifest(nextManifest) {
      manifest = nextManifest
      cache.clear()
      styleMetadata.clear()
      createStyleSheet(nextManifest)
      activeManifest = nextManifest
    },
    setEnvironment(nextEnvironment) {
      environment = nextEnvironment
      activeEnvironment = nextEnvironment
      cache.clear()
    },
    getManifest() {
      return manifest
    },
  }
  if (initialManifest) {
    createStyleSheet(initialManifest)
    activeManifest = initialManifest
  }
  return runtime
}

const defaultRuntime = createNativeStyleRuntime()

export function setManifest(manifest: NativeStyleManifest) {
  defaultRuntime.setManifest(manifest)
}

/** 由 Expo virtual module 注入，避免 runtime 引入 Node-only 的 require shim。 */
export function setStyleSheetFactory(factory: StyleSheetFactory) {
  styleSheetFactory = factory
  if (activeManifest) { createStyleSheet(activeManifest) }
}

export function setEnvironment(environment: NativeStyleEnvironment) {
  defaultRuntime.setEnvironment(environment)
}

export function getManifest() {
  return activeManifest ?? defaultRuntime.getManifest()
}

export function tw(value: NativeClassValue, environment?: NativeStyleEnvironment): NativeStyleValue {
  return defaultRuntime.tw(value, environment)
}

export function getStaticStyle(ids: readonly string[], environment?: NativeStyleEnvironment) {
  return defaultRuntime.getStaticStyle(ids, environment)
}

export function composeStyle<const InlineStyle>(tailwindStyle: NativeStyleValue, inlineStyle: InlineStyle) {
  return defaultRuntime.composeStyle(tailwindStyle, inlineStyle)
}

export type { NativeClassValue, NativePlatform, NativeStyleEnvironment, NativeStyleManifest, NativeStyleValue }
