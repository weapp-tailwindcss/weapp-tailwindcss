import { consumeCascadeLayers, postcss } from '@/index'
import { test } from 'vitest'

function createLayerCorpus(layerCount: number, fragmentsPerLayer: number) {
  const layerNames = Array.from({ length: layerCount }, (_, index) => `layer-${index}`)
  const parts = [`@layer ${layerNames.join(', ')};`]
  for (let fragment = fragmentsPerLayer - 1; fragment >= 0; fragment--) {
    for (let layer = layerCount - 1; layer >= 0; layer--) {
      parts.push([
        `@media (min-width: ${320 + fragment}px) {`,
        `  @layer ${layerNames[layer]} { .rule-${layer}-${fragment} { order: ${fragment}; } }`,
        '}',
      ].join('\n'))
    }
  }
  parts.push('.unlayered { display: block; }')
  return parts.join('\n')
}

const css = createLayerCorpus(64, 8)

test('cascade layer consumer benchmark', async ({ bench }) => {
  await bench('consume 512 conditional layer fragments', () => {
    const root = postcss.parse(css)
    consumeCascadeLayers(root)
  }).run()
})
