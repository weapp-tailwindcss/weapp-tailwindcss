import type { NativeStyleManifest, NativeStyleRule } from '../types'
import type { RelativeLineHeight } from './line-height'
import type { DeferredBoxShadow } from './shadow'
import type { NativeStyleEnvironment, NativeStyleValue } from './types'
import { resolveNativeTransform } from '@weapp-tailwindcss/postcss/native-runtime'
import { relativeLineHeightStyle } from './line-height'
import { deferredBoxShadowStyle } from './shadow'

interface StyleValue { [key: string]: unknown }

function matches(rule: NativeStyleRule, environment: NativeStyleEnvironment) {
  if (rule.colorScheme && rule.colorScheme !== environment.colorScheme) {
    return false
  }
  if (!rule.platform) {
    return true
  }
  if (rule.platform === 'native') {
    return environment.platform !== 'web'
  }
  return rule.platform === environment.platform
}

export function resolveRules(ids: readonly string[], manifest: NativeStyleManifest | undefined, environment: NativeStyleEnvironment, nativeStyleSheet?: Record<string, NativeStyleValue>) {
  const normal: Array<{ rule: NativeStyleRule, id: string }> = []
  const important: Array<{ rule: NativeStyleRule, id: string }> = []
  for (const id of ids) {
    const rule = manifest?.styleEntries?.[id]
    if (rule) {
      if (!matches(rule, environment)) {
        continue
      }
      ;(rule.important ? important : normal).push({ rule, id })
      continue
    }
    // 显式 Babel plugin 没有拿到 ID map 时，token 本身仍可作为静态 lookup key。
    const fallbackIds = manifest?.staticLookup?.[id] ?? []
    if (fallbackIds.length) {
      for (const fallbackId of fallbackIds) {
        const fallbackRule = manifest?.styleEntries?.[fallbackId]
        if (!fallbackRule || !matches(fallbackRule, environment)) {
          continue
        }
        ;(fallbackRule.important ? important : normal).push({ rule: fallbackRule, id: fallbackId })
      }
    }
    else {
      for (const fallbackRule of manifest?.rules?.[id] ?? []) {
        if (!matches(fallbackRule, environment)) {
          continue
        }
        ;(fallbackRule.important ? important : normal).push({ rule: fallbackRule, id })
      }
    }
  }
  const order = (left: { rule: NativeStyleRule }, right: { rule: NativeStyleRule }) => (left.rule.order ?? 0) - (right.rule.order ?? 0)
  normal.sort(order)
  important.sort(order)
  const customProperties = Object.assign({}, ...[...normal, ...important].map(({ rule }) => rule.customProperties))
  const style: StyleValue = {}
  const importantStyle: StyleValue = {}
  let relative: RelativeLineHeight | undefined
  let boxShadow: DeferredBoxShadow | undefined
  let transform: { expression: NonNullable<NativeStyleRule['transformExpression']>, important: boolean } | undefined
  const apply = (rule: NativeStyleRule, isImportant: boolean) => {
    Object.assign(style, rule.style)
    if (isImportant) {
      Object.assign(importantStyle, rule.style)
    }
    if (rule.lineHeightMultiplier !== undefined) {
      relative = { multiplier: rule.lineHeightMultiplier, important: isImportant }
      delete style.lineHeight
      if (isImportant) {
        // 延迟声明已经赢得级联；缺少上下文时也不能重放被覆盖的值。
        delete importantStyle.lineHeight
      }
    }
    else if ('lineHeight' in rule.style) {
      relative = undefined
    }
    if (rule.boxShadowExpression) {
      boxShadow = { expression: rule.boxShadowExpression, bindings: customProperties, important: isImportant }
      delete style.boxShadow
      if (isImportant) {
        delete importantStyle.boxShadow
      }
    }
    else if ('boxShadow' in rule.style) {
      boxShadow = undefined
    }
    if (rule.transformExpression) {
      transform = { expression: rule.transformExpression, important: isImportant }
    }
    else if ('transform' in rule.style) {
      transform = undefined
    }
  }
  for (const { rule } of normal) {
    apply(rule, false)
  }
  for (const { rule } of important) {
    apply(rule, true)
  }
  if (transform) {
    const computed = resolveNativeTransform(transform.expression, customProperties)
    if (!computed) {
      throw new Error(`无法将当前 class 组合的 transform 编译为原生变换：${transform.expression.value}`)
    }
    style.transform = computed
    if (transform.important) {
      importantStyle.transform = computed
    }
  }
  if (boxShadow) {
    boxShadow.color = typeof style.color === 'string' ? style.color : environment.color
    boxShadow.importantColor = typeof importantStyle.color === 'string' ? importantStyle.color : undefined
    const computed = deferredBoxShadowStyle(boxShadow)
    if (computed) {
      Object.assign(style, computed)
      if (boxShadow.important) {
        Object.assign(importantStyle, computed)
      }
    }
  }
  if (relative) {
    relative.fontSize = typeof style.fontSize === 'number' ? style.fontSize : environment.fontSize
    relative.importantFontSize = typeof importantStyle.fontSize === 'number' ? importantStyle.fontSize : undefined
    const computed = relativeLineHeightStyle(relative)
    if (computed) {
      Object.assign(style, computed)
      if (relative.important) {
        Object.assign(importantStyle, computed)
      }
    }
  }
  const normalIds = normal.map(item => item.id)
  const importantIds = important.map(item => item.id)
  const asStyleValue = (ids: string[], fallback: StyleValue): NativeStyleValue => {
    // 相对值依赖本次组合，不能返回缺少最终行高的静态注册 ID。
    if (relative || boxShadow || transform) {
      return fallback
    }
    if (!nativeStyleSheet) {
      return fallback
    }
    const values = ids.map(id => nativeStyleSheet[id]).filter(value => value !== undefined)
    if (values.length === 1) {
      return values[0]
    }
    if (values.length > 1) {
      return values
    }
    return fallback
  }
  return {
    style,
    importantStyle,
    styleValue: asStyleValue([...normalIds, ...importantIds], style),
    importantValue: asStyleValue(importantIds, importantStyle),
    relativeLineHeight: relative,
    boxShadow,
  }
}
