import { describe, expect, it } from 'vitest'
import { createGeneratorSourceRecord, getGeneratorSourceMetadata } from '@/generation/source-resolver'
import { withGeneratorSourceMetadata } from '@/generation/source-resolver/metadata'

describe('generator source metadata', () => {
  it('survives source cloning without exposing string metadata fields', () => {
    const source = withGeneratorSourceMetadata({
      base: '/workspace',
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
      projectRoot: '/workspace',
    } as any, {
      matchedCssSourceFile: '/workspace/src/app.css',
      primaryCssSource: true,
    })
    const cloned = {
      ...source,
      css: '@import "tailwindcss/utilities";',
    }

    expect(getGeneratorSourceMetadata(cloned)).toEqual({
      matchedCssSourceFile: '/workspace/src/app.css',
      primaryCssSource: true,
    })
    expect(Object.keys(cloned)).toEqual([
      'base',
      'baseFallbacks',
      'css',
      'dependencies',
      'projectRoot',
    ])
    expect(JSON.stringify(cloned)).not.toContain('matchedCssSourceFile')
  })

  it('detaches metadata from generator source records', () => {
    const source = withGeneratorSourceMetadata({
      base: '/workspace',
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: ['/workspace/tailwind.config.js'],
      projectRoot: '/workspace',
    } as any, {
      matchedCssSourceFile: '/workspace/src/app.css',
    })

    const record = createGeneratorSourceRecord(source)

    expect(record.metadata).toEqual({
      matchedCssSourceFile: '/workspace/src/app.css',
    })
    expect(getGeneratorSourceMetadata(record.source)).toBeUndefined()
    expect(Object.getOwnPropertySymbols(record.source)).toHaveLength(0)
  })
})
