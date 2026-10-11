import path from 'node:path'
import { createWeappTailwindcssPostcssPlugin } from '@weapp-tailwindcss/postcss/plugin'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { expect } from 'vitest'
import { createWeappTailwindcssGenerator, normalizeWeappTailwindcssGeneratorOptions, resolveTailwindV4Source } from '@/generator'
import plugin from '@/postcss'
import { sourceGenerationContract } from '../../../test-helper/src/source-generation-contract'

for (const scanMode of [undefined, 'compiled'] as const) {
  sourceGenerationContract(`核心 ${scanMode ?? '兼容扫描'}`, {
    async generate(root, css) {
      const generator = createWeappTailwindcssGenerator(await resolveTailwindV4Source({ base: root, projectRoot: root, css }))
      try {
        return await generator.generate({ target: 'web', scanSources: true, ...(scanMode ? { scanMode } : {}), incrementalCache: false })
      }
      finally {
        generator.dispose?.()
      }
    },
  }, expect, path.resolve(__dirname, '../../../..'))
}
const compatibilityPlugin = createWeappTailwindcssPostcssPlugin({
  createGenerator: source => createWeappTailwindcssGenerator(source as Parameters<typeof createWeappTailwindcssGenerator>[0]),
  normalizeGeneratorOptions: options => normalizeWeappTailwindcssGeneratorOptions(options as Parameters<typeof normalizeWeappTailwindcssGeneratorOptions>[0]),
  resolveTailwindV4Source: options => resolveTailwindV4Source(options as Parameters<typeof resolveTailwindV4Source>[0]),
})

for (const [name, createPlugin] of [['PostCSS 编译扫描适配器', plugin], ['PostCSS 兼容扫描适配器', compatibilityPlugin]] as const) {
  sourceGenerationContract(name, {
    async generate(root, css) {
      const result = await postcss([createPlugin({ base: root, projectRoot: root, generator: { target: 'web' } })]).process(css, { from: path.join(root, 'input.css') })
      return { css: result.css }
    },
  }, expect, path.resolve(__dirname, '../../../..'))
}
