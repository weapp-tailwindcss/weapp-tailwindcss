export {
  compileCssMacroConditionalComments,
  CSS_MACRO_STYLE_OPTIONS_MARKER,
  hasCssMacroStyleOptions,
  hasCssMacroTailwindV4CustomVariantConditionalComments,
  hasCssMacroTailwindV4Directive,
  hasCssMacroTailwindV4InternalAtRules,
  hasCssMacroTailwindV4Source,
  transformCssMacroCss,
  transformCssMacroTailwindV4Source,
  withCssMacroStyleOptions,
} from '@weapp-tailwindcss/postcss/transform'

export const CSS_MACRO_PLUGIN_MARKER = '__weappTailwindcssCssMacro'

interface CssMacroMarkedPlugin {
  [CSS_MACRO_PLUGIN_MARKER]?: true
}

export function markCssMacroPlugin<T extends object>(value: T): T {
  Object.defineProperty(value, CSS_MACRO_PLUGIN_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
  })
  return value
}

export function isCssMacroTailwindPlugin(value: unknown): boolean {
  return Boolean(
    value
    && (typeof value === 'function' || typeof value === 'object')
    && (value as CssMacroMarkedPlugin)[CSS_MACRO_PLUGIN_MARKER] === true,
  )
}

export function hasCssMacroTailwindPlugin(plugins: unknown): boolean {
  if (!plugins) {
    return false
  }

  if (Array.isArray(plugins)) {
    return plugins.some(isCssMacroTailwindPlugin)
  }

  if (typeof plugins === 'object') {
    return Object.values(plugins as Record<string, unknown>).some(isCssMacroTailwindPlugin)
  }

  return false
}
