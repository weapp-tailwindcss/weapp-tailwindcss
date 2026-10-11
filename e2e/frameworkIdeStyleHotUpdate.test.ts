import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { buildCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { createStyleMutationPayload } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations'
import { assertStyleOutput } from './frameworkIdeStyleHotUpdate'

describe('IDE style HMR declaration validation', () => {
  const watchCase = buildCases(process.cwd(), { includeLocalOnly: true })
    .find(item => item.name === 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4')!

  it('rejects an unresolved duplicate after the correctly expanded function rule', () => {
    const payload = createStyleMutationPayload(watchCase)
    const css = `${payload.styleNeedle} { ${payload.expectedApplyDeclarations.join(';')} }
${payload.functionNeedle} { ${payload.expectedFunctionDeclarations.join(';')} }
${payload.functionNeedle} { padding: theme('spacing.2'); }`

    expect(() => assertStyleOutput(watchCase, css, payload)).toThrow(/did not resolve Tailwind function/)
  })

  it('accepts fully expanded function declarations', () => {
    const payload = createStyleMutationPayload(watchCase)
    const css = `${payload.styleNeedle} { ${payload.expectedApplyDeclarations.join(';')} }
${payload.functionNeedle} { ${payload.expectedFunctionDeclarations.join(';')} }`

    expect(() => assertStyleOutput(watchCase, css, payload)).not.toThrow()
  })
})
