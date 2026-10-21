import type { RelativeLineHeight } from './runtime/line-height'
import type { DeferredBoxShadow } from './runtime/shadow'
import type { NativeClassValue, NativeStyleEnvironment, NativeStyleRuntime, NativeStyleValue } from './runtime/types'
import type { NativeManifestPublication, NativePlatform, NativeStyleManifest } from './types'
import { copyManifestSnapshot, copyPublication } from './manifest'
import { flattenInlineStyle, relativeLineHeightStyle } from './runtime/line-height'
import { resolveRules } from './runtime/resolve'
import { inlineBoxShadowStyle } from './runtime/shadow'

interface StyleValue { [key: string]: unknown }
interface StyleMeta { important?: NativeStyleValue, relativeLineHeight?: RelativeLineHeight | undefined, boxShadow?: DeferredBoxShadow | undefined }
type StyleSheetFactory = (value: Record<string, StyleValue>) => Record<string, NativeStyleValue>
type StyleSheetFlattener = (value: NativeStyleValue) => StyleValue | undefined

let activeEnvironment: NativeStyleEnvironment = {}
let styleSheetFactory: StyleSheetFactory | undefined
let styleSheetFlattener: StyleSheetFlattener | undefined
let styleSheetRevision = 0

function resolveRegisteredStyle(value: number) {
  return styleSheetFlattener?.(value as NativeStyleValue)
}

function createStyleSheet(manifest: NativeStyleManifest) {
  const revision = styleSheetRevision
  const factory = styleSheetFactory
  const source = manifest.styleSheet ?? Object.fromEntries(
    Object.entries(manifest.styleEntries ?? {}).map(([id, rule]) => [id, rule.style]),
  )
  return { revision, styles: factory?.(JSON.parse(JSON.stringify(source))) }
}

function flatten(value: NativeClassValue, result: string[]) {
  if (!value) {
    return
  }
  if (typeof value === 'string') {
    result.push(...value.split(/\s+/).filter(Boolean))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      flatten(item, result)
    }
    return
  }
  for (const [className, enabled] of Object.entries(value)) {
    if (enabled) {
      result.push(className)
    }
  }
}

function canonicalTokens(value: NativeClassValue) {
  const tokens: string[] = []
  flatten(value, tokens)
  return [...new Set(tokens)].sort()
}

function resolveDynamic(value: NativeClassValue, manifest: NativeStyleManifest | undefined, environment: NativeStyleEnvironment, nativeStyleSheet?: Record<string, NativeStyleValue>) {
  const classNames = canonicalTokens(value)
  const ids = manifest?.staticLookup
    ? classNames.flatMap(className => manifest.staticLookup?.[className] ?? [])
    : classNames
  return resolveRules(ids, manifest, environment, nativeStyleSheet)
}

function rememberStyle(styleMetadata: Map<unknown, StyleMeta>, style: NativeStyleValue, importantStyle: NativeStyleValue, relativeLineHeight?: RelativeLineHeight, boxShadow?: DeferredBoxShadow) {
  const important = importantStyle && (typeof importantStyle !== 'object' || Object.keys(importantStyle).length) ? importantStyle : undefined
  if (important !== undefined || relativeLineHeight || boxShadow) {
    styleMetadata.set(style, { important, relativeLineHeight, boxShadow })
  }
  return style
}

export function createNativeStyleRuntime(initialManifest?: NativeStyleManifest, initialPublication?: NativeManifestPublication): NativeStyleRuntime {
  if (!initialManifest && initialPublication) {
    throw new Error('React Native 发布身份必须绑定 manifest')
  }
  let manifest = initialManifest ? copyManifestSnapshot(initialManifest) : undefined
  let publication = copyPublication(initialPublication)
  let environment = activeEnvironment
  const cache = new Map<string, NativeStyleValue>()
  const styleMetadata = new Map<unknown, StyleMeta>()
  const initial = manifest ? createStyleSheet(manifest) : undefined
  let nativeStyleSheet = initial?.styles
  let revision = initial?.revision ?? styleSheetRevision
  const ensureStyleSheet = () => {
    if (revision !== styleSheetRevision) {
      const prepared = manifest ? createStyleSheet(manifest) : undefined
      nativeStyleSheet = prepared?.styles
      revision = prepared?.revision ?? styleSheetRevision
      cache.clear()
    }
  }
  const runtime: NativeStyleRuntime = {
    tw(value, requestedEnvironment = {}) {
      ensureStyleSheet()
      const effectiveEnvironment = { ...environment, ...requestedEnvironment }
      const tokens = canonicalTokens(value)
      const key = `${tokens.join('\u0001')}|${effectiveEnvironment.colorScheme ?? ''}|${effectiveEnvironment.platform ?? ''}|${effectiveEnvironment.fontSize ?? ''}|${effectiveEnvironment.color ?? ''}`
      const cached = cache.get(key)
      if (cached) {
        return cached
      }
      const resolved = resolveDynamic(value, manifest, effectiveEnvironment, nativeStyleSheet)
      const style = rememberStyle(styleMetadata, resolved.styleValue, resolved.importantValue, resolved.relativeLineHeight, resolved.boxShadow)
      cache.set(key, style)
      return style
    },
    getStaticStyle(ids, requestedEnvironment = {}) {
      ensureStyleSheet()
      const effectiveEnvironment = { ...environment, ...requestedEnvironment }
      const resolved = resolveRules(ids, manifest, effectiveEnvironment, nativeStyleSheet)
      return rememberStyle(styleMetadata, resolved.styleValue, resolved.importantValue, resolved.relativeLineHeight, resolved.boxShadow)
    },
    composeStyle(tailwindStyle, inlineStyle) {
      const metadata = styleMetadata.get(tailwindStyle)
      const important = metadata?.important
      const inline = flattenInlineStyle(inlineStyle, resolveRegisteredStyle)
      const relative = relativeLineHeightStyle(metadata?.relativeLineHeight, inline)
      const boxShadow = inlineBoxShadowStyle(metadata?.boxShadow, inline)
      if (relative || boxShadow) {
        return [tailwindStyle, inlineStyle, { ...flattenInlineStyle(important, resolveRegisteredStyle), ...relative, ...boxShadow }]
      }
      return important !== undefined
        ? [tailwindStyle, inlineStyle, important]
        : [tailwindStyle, inlineStyle]
    },
    setManifest(nextManifest, nextPublication) {
      const preparedManifest = copyManifestSnapshot(nextManifest)
      const preparedPublication = copyPublication(nextPublication)
      const preparedStyleSheet = createStyleSheet(preparedManifest)
      manifest = preparedManifest
      publication = preparedPublication
      nativeStyleSheet = preparedStyleSheet.styles
      revision = preparedStyleSheet.revision
      cache.clear()
      styleMetadata.clear()
    },
    setEnvironment(nextEnvironment) {
      environment = nextEnvironment
      activeEnvironment = nextEnvironment
      cache.clear()
    },
    getManifest() {
      return manifest
    },
    getPublication() {
      return publication
    },
  }
  return runtime
}

const defaultRuntime = createNativeStyleRuntime()

export function setManifest(manifest: NativeStyleManifest, publication?: NativeManifestPublication) {
  defaultRuntime.setManifest(manifest, publication)
}

/** 由 Expo virtual module 注入，避免 runtime 引入 Node-only 的 require shim。 */
export function setStyleSheetFactory(factory: StyleSheetFactory, flatten?: StyleSheetFlattener) {
  styleSheetFactory = factory
  styleSheetFlattener = flatten
  styleSheetRevision += 1
}

export function setEnvironment(environment: NativeStyleEnvironment) {
  defaultRuntime.setEnvironment(environment)
}

export function getManifest() {
  return defaultRuntime.getManifest()
}

export function getPublication() {
  return defaultRuntime.getPublication()
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

export type { NativeClassValue, NativeManifestPublication, NativePlatform, NativeStyleEnvironment, NativeStyleManifest, NativeStyleValue }
