import type { AtRule, Container, Root } from 'postcss'
import postcss from 'postcss'
import { parseCssImportSpecifier } from '../../syntax/css-import'
import { removeUnsupportedCascadeLayers } from '../mini-program-css/at-rules'

function isTailwindCssPreflightImport(params: string) {
  const specifier = parseCssImportSpecifier(params)?.specifier
  return specifier === 'tailwindcss/preflight.css' || specifier === 'tailwindcss/preflight'
}

/** 从小程序入口 CSS 中移除 Tailwind v4 preflight import。 */
export function removeTailwindV4PreflightImports(css: string) {
  if (!css.includes('preflight')) {
    return css
  }

  let root: Root
  try {
    root = postcss.parse(css)
  }
  catch {
    return css
  }

  let changed = false
  root.walkAtRules('import', (rule) => {
    if (isTailwindCssPreflightImport(rule.params)) {
      rule.remove()
      changed = true
    }
  })

  return changed ? root.toString() : css
}

function hasThemeParent(rule: AtRule) {
  let parent = rule.parent as Container | undefined
  while (parent) {
    if (parent.type === 'atrule' && (parent as AtRule).name === 'theme') {
      return true
    }
    parent = parent.parent as Container | undefined
  }
  return false
}

function isVendorPrefixedKeyframes(rule: AtRule) {
  return rule.name.startsWith('-') && rule.name.endsWith('keyframes')
}

/** 删除 `@theme` 内不被小程序接受的厂商前缀 keyframes。 */
export function removeUnsupportedThemeVendorKeyframes(css: string) {
  if (!css.includes('@theme') || !css.includes('@-')) {
    return css
  }

  let root: Root
  try {
    root = postcss.parse(css)
  }
  catch {
    return css
  }

  return removeUnsupportedThemeVendorKeyframesRoot(root) ? root.toString() : css
}

/** 复用已有 AST，避免运行时样式清理重复解析。 */
export function removeUnsupportedThemeVendorKeyframesRoot(root: Root) {
  let changed = false
  root.walkAtRules((rule) => {
    if (isVendorPrefixedKeyframes(rule) && hasThemeParent(rule)) {
      rule.remove()
      changed = true
    }
  })

  return changed
}

/** loader 调用端决定是否需要清理；非法 CSS 沿用原有抛错行为。 */
export function normalizeTailwindV4RuntimeCss(css: string) {
  const root = postcss.parse(css)
  removeUnsupportedCascadeLayers(root)
  removeUnsupportedThemeVendorKeyframesRoot(root)
  return root.toString()
}
