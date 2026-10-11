import type { PluginCreator } from 'tailwindcss/plugin'
import plugin from 'tailwindcss/plugin'
import { defu } from '../utils'
import { markCssMacroPlugin } from './auto'
import { createConditionalAtRule, createNegativeConditionalAtRule } from './constants'

type PluginWithConfig = ReturnType<typeof plugin>

export interface Options {
  variantsMap?: Record<string, string | { value: string, negative?: boolean }>
  dynamic?: boolean
}

interface NormalizedVariant {
  name: string
  negative: boolean
  value: string
}

export type CssMacroPlugin = (options?: Options) => PluginWithConfig

type CssMacroOptionsFunction = CssMacroPlugin & {
  __configFunction?: unknown
  __isOptionsFunction?: boolean
  __pluginFunction?: unknown
}

const defaultOptions: Required<Options> = {
  dynamic: true,
  variantsMap: {},
}

const cssMacroFactory: CssMacroOptionsFunction = plugin.withOptions((options?: Options): PluginCreator => {
  const { dynamic, variantsMap } = defu<Required<Options>, Options[]>(options ?? {}, defaultOptions)

  const staticVariants: NormalizedVariant[] = Object.entries(variantsMap).map(([name, config]) => {
    if (typeof config === 'string') {
      return {
        name,
        negative: false,
        value: config,
      }
    }
    return {
      name,
      negative: Boolean(config.negative),
      value: config.value,
    }
  })

  return (api) => {
    const { matchVariant, addVariant } = api
    const supportsDynamic = typeof matchVariant === 'function'
    if (dynamic && supportsDynamic) {
      matchVariant('ifdef', value => createConditionalAtRule(value))
      matchVariant('ifndef', value => createNegativeConditionalAtRule(value))
    }

    if (typeof addVariant === 'function') {
      for (const variant of staticVariants) {
        const query = variant.negative
          ? createNegativeConditionalAtRule(variant.value)
          : createConditionalAtRule(variant.value)
        addVariant(variant.name, query)
      }
    }
  }
})

const cssMacro: CssMacroPlugin = markCssMacroPlugin(((options?: Options) => {
  return markCssMacroPlugin(cssMacroFactory(options))
}) as typeof cssMacroFactory)

const cssMacroOptionsFunction = cssMacro as CssMacroOptionsFunction
const cssMacroFactoryOptionsFunction = cssMacroFactory as CssMacroOptionsFunction

if (cssMacroFactoryOptionsFunction.__isOptionsFunction !== undefined) {
  cssMacroOptionsFunction.__isOptionsFunction = cssMacroFactoryOptionsFunction.__isOptionsFunction
}
cssMacroOptionsFunction.__pluginFunction = cssMacroFactoryOptionsFunction.__pluginFunction
cssMacroOptionsFunction.__configFunction = cssMacroFactoryOptionsFunction.__configFunction

export default cssMacro
