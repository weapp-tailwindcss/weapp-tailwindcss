/* eslint-disable style/max-statements-per-line */

import type { CompileNativeStylesheetOptions, NativeStyleManifest, NativeStyleRule } from './types'
import { createHash } from 'node:crypto'
import { compileNativeCss, splitClassName, variantForClass } from '@weapp-tailwindcss/postcss/native'

export { baseClassName } from '@weapp-tailwindcss/postcss/native'

export function addNativeVariantRules(manifest: NativeStyleManifest, candidates: Iterable<string>) {
  for (const candidate of candidates) {
    const parts = splitClassName(candidate)
    if (parts.length < 2) { continue }
    const base = parts.at(-1)
    if (!base || manifest.rules[candidate] || !manifest.rules[base]) { continue }
    const variant = variantForClass(candidate)
    if (!variant.colorScheme && !variant.platform) { continue }
    manifest.rules[candidate] = manifest.rules[base].map(rule => ({
      ...rule,
      ...variant,
      style: { ...rule.style },
    }))
    manifest.classSet.push(candidate)
  }
}

/** 为 manifest 生成稳定的 StyleSheet ID 和 Babel 静态 lookup。 */
export function finalizeNativeManifest(manifest: NativeStyleManifest): NativeStyleManifest {
  const styleSheet: Record<string, Record<string, unknown>> = {}
  const styleEntries: Record<string, NativeStyleRule> = {}
  const staticLookup: Record<string, string[]> = {}
  for (const [className, rules] of Object.entries(manifest.rules)) {
    for (const [index, rule] of rules.entries()) {
      const identity = `${className}\0${index}\0${rule.colorScheme ?? ''}\0${rule.platform ?? ''}\0${rule.important ? 'important' : 'normal'}`
      const id = rule.id ?? `s${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`
      rule.id = id
      styleSheet[id] = rule.style
      styleEntries[id] = rule
      ;(staticLookup[className] ??= []).push(id)
    }
  }
  manifest.styleSheet = styleSheet
  manifest.styleEntries = styleEntries
  manifest.staticLookup = staticLookup
  manifest.classSet = Object.keys(manifest.rules)
  return manifest
}

export function compileNativeStylesheet(css: string, options: CompileNativeStylesheetOptions = {}): NativeStyleManifest {
  const compiled = compileNativeCss(css, options)
  return finalizeNativeManifest({
    version: 1,
    classSet: Object.keys(compiled.rules),
    ...compiled,
  })
}
