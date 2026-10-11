import type {
  PluginCreator,
  WeappTailwindcssPostcssGenerator,
  WeappTailwindcssPostcssPluginAdapters,
  WeappTailwindcssPostcssPluginOptions,
} from '@weapp-tailwindcss/postcss/plugin'
import { createWeappTailwindcssPostcssPlugin } from '@weapp-tailwindcss/postcss/plugin'
import {
  createWeappTailwindcssGenerator,
  normalizeWeappTailwindcssGeneratorOptions,
  resolveTailwindV4Source,
} from './generator'

const adapters: WeappTailwindcssPostcssPluginAdapters = {
  compiledSourceScan: true,
  createGenerator: (source) => {
    const generator = createWeappTailwindcssGenerator(source as Parameters<typeof createWeappTailwindcssGenerator>[0])
    return generator as unknown as WeappTailwindcssPostcssGenerator
  },
  normalizeGeneratorOptions: options => normalizeWeappTailwindcssGeneratorOptions(options as Parameters<typeof normalizeWeappTailwindcssGeneratorOptions>[0]),
  resolveTailwindV4Source: options => resolveTailwindV4Source(options as Parameters<typeof resolveTailwindV4Source>[0]),
}

export type { WeappTailwindcssPostcssPluginOptions }

export const weappTailwindcssPostcssPlugin: PluginCreator<WeappTailwindcssPostcssPluginOptions> = createWeappTailwindcssPostcssPlugin(adapters)

export default weappTailwindcssPostcssPlugin
