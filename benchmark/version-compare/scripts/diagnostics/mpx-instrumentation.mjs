import { generationTargets } from './operation-instrumentation.mjs'

export { instrumentOperationSource as instrumentMpxSource } from './operation-instrumentation.mjs'

export const mpxTargets = [
  ['webpack', 'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin/v5-assets.ts'],
  ['scan', 'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/source-candidate-cache.ts'],
  ...generationTargets.filter(([kind]) => kind !== 'raw-generation'),
]
